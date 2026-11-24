package expo.modules.noterivclientcertificate

import android.content.Context
import android.os.SystemClock
import android.security.KeyChain
import android.security.KeyChainException
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.io.InterruptedIOException
import java.net.SocketException
import java.security.cert.X509Certificate
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLException

class RequestOptions : Record {
  /** A name for this request, so it can be cancelled. */
  @Field
  val id: String = ""

  /** The certificate to show, by its name in the phone's store. */
  @Field
  val alias: String = ""

  /** The one server that may be shown the certificate. */
  @Field
  val host: String = ""

  @Field
  val port: Int = 443

  @Field
  val method: String = "GET"

  @Field
  val url: String = ""

  @Field
  val headers: Map<String, String> = emptyMap()
}

internal class WrongServerException :
  CodedException("ERR_CLIENT_CERT_WRONG_SERVER", "The request is not for the server this certificate was chosen for.", null)

internal class CertificateUnavailableException(alias: String) :
  CodedException("ERR_CLIENT_CERT_UNAVAILABLE", "The certificate \"$alias\" could not be read from this phone.", null)

internal class CertificateRefusedException(reason: String) :
  CodedException("ERR_CLIENT_CERT_REFUSED", reason, null)

internal class RequestCanceledException :
  CodedException("ERR_REQUEST_CANCELED", "The request was cancelled.", null)

internal class RequestFailedException(reason: String) :
  CodedException("ERR_REQUEST_FAILED", reason, null)

/**
 * A server's name and port the way every address is compared here: written
 * out by the same code that reads the address of a request, so "Example.COM"
 * and "example.com", or two spellings of one IPv6 address, are one server.
 */
private fun serverOf(host: String, port: Int): HttpUrl? =
  if (port in 1..65535) "https://$host:$port/".toHttpUrlOrNull() else null

/** Methods a request must carry a body for, even an empty one. */
private val NEEDS_BODY = setOf("POST", "PUT", "PATCH", "PROPPATCH", "REPORT")

/** What went wrong, in the system's own words, without the package names in front. */
private fun reasonOf(error: Throwable): String {
  val text = error.message?.trim()
  return if (text.isNullOrEmpty()) error.javaClass.simpleName else text
}

/**
 * Client certificates for WebDAV sync.
 *
 * Some people put their own server behind a second lock: besides the
 * password, the server only talks to a device that shows a certificate it
 * knows. On Android such a certificate is installed in the system's store
 * and an app has to ask for it; the owner of the phone picks which one the
 * app may use. This module asks, and sends WebDAV requests over connections
 * that show the picked certificate to the one server it was picked for.
 */
class ClientCertificateModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  private val lock = Any()
  private var transport: CertificateTransport? = null
  private val calls = ConcurrentHashMap<String, Call>()

  private fun transportFor(host: String, port: Int, alias: String): CertificateTransport = synchronized(lock) {
    val current = transport
    if (current != null && current.matches(host, port, alias)) return current
    // Another certificate or another server: nothing of the old connections
    // is kept, so no earlier sign-in can stand in for the new choice.
    current?.close()
    CertificateTransport(context, host, port, alias).also { transport = it }
  }

  private fun forget() = synchronized(lock) {
    transport?.close()
    transport = null
  }

  /** Whether the certificate and its key can be read right now, and whose it is. */
  private fun describe(alias: String): Map<String, Any?> {
    val leaf: X509Certificate? = try {
      val key = KeyChain.getPrivateKey(context, alias)
      val chain = KeyChain.getCertificateChain(context, alias)
      if (key == null || chain.isNullOrEmpty()) null else chain[0]
    } catch (e: KeyChainException) {
      null
    } catch (e: InterruptedException) {
      Thread.currentThread().interrupt()
      null
    } catch (e: RuntimeException) {
      null
    }
    if (leaf == null) return mapOf("available" to false, "subject" to null, "issuer" to null, "expires" to null)
    return mapOf(
      "available" to true,
      "subject" to leaf.subjectX500Principal.name,
      "issuer" to leaf.issuerX500Principal.name,
      "expires" to leaf.notAfter.time.toDouble()
    )
  }

  private fun failure(transport: CertificateTransport, error: IOException, startedAt: Long, call: Call): CodedException {
    val keys = transport.keyManager
    return when {
      call.isCanceled() -> RequestCanceledException()
      keys.unavailableAt >= startedAt -> CertificateUnavailableException(transport.alias)
      // The server saw the certificate during this very request and the
      // connection then broke: the usual sign of a certificate it does not accept.
      keys.offeredAt >= startedAt && error !is InterruptedIOException && (error is SSLException || error is SocketException || reasonOf(error).contains("unexpected end of stream")) ->
        CertificateRefusedException(reasonOf(error))
      else -> RequestFailedException(reasonOf(error))
    }
  }

  private fun start(options: RequestOptions, body: ByteArray?, promise: Promise) {
    val url = options.url.toHttpUrlOrNull() ?: throw RequestFailedException("The address is not valid.")
    // The certificate was picked for one server. A request for any other
    // address is refused here, before a connection exists.
    val server = serverOf(options.host, options.port) ?: throw WrongServerException()
    if (!url.isHttps || url.host != server.host || url.port != server.port) {
      throw WrongServerException()
    }
    val method = options.method.uppercase()
    val requestBody = when {
      body != null -> body.toRequestBody(null)
      method in NEEDS_BODY -> ByteArray(0).toRequestBody(null)
      else -> null
    }
    val request = Request.Builder().url(url).apply {
      for ((name, value) in options.headers) header(name, value)
      method(method, requestBody)
    }.build()

    val transport = transportFor(server.host, server.port, options.alias)
    val startedAt = SystemClock.elapsedRealtime()
    val call = transport.client.newCall(request)
    calls[options.id] = call
    call.enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {
        calls.remove(options.id)
        promise.reject(failure(transport, e, startedAt, call))
      }

      override fun onResponse(call: Call, response: Response) {
        try {
          val bytes = response.use { it.body?.bytes() ?: ByteArray(0) }
          val headers = HashMap<String, String>()
          for (name in response.headers.names()) {
            headers[name.lowercase()] = response.headers.values(name).joinToString(", ")
          }
          calls.remove(options.id)
          promise.resolve(mapOf("status" to response.code, "headers" to headers, "body" to bytes))
        } catch (e: IOException) {
          calls.remove(options.id)
          promise.reject(failure(transport, e, startedAt, call))
        }
      }
    })
  }

  /** Connects once, shows no certificate, and reports whether the server asked for one. */
  private fun probe(host: String, port: Int, promise: Promise) {
    val recorder = AskRecorder()
    val trustManager = platformTrustManager()
    val sslContext = SSLContext.getInstance("TLS")
    sslContext.init(arrayOf(recorder), arrayOf(trustManager), null)
    val client = OkHttpClient.Builder()
      .sslSocketFactory(sslContext.socketFactory, trustManager)
      .followRedirects(false)
      .followSslRedirects(false)
      .callTimeout(20, TimeUnit.SECONDS)
      .build()
    val url = serverOf(host, port) ?: throw RequestFailedException("The address is not valid.")
    val request = Request.Builder().url(url).header("User-Agent", "Noteriv").method("OPTIONS", null).build()
    client.newCall(request).enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {
        client.connectionPool.evictAll()
        promise.resolve(mapOf("asked" to recorder.asked))
      }

      override fun onResponse(call: Call, response: Response) {
        response.close()
        client.connectionPool.evictAll()
        promise.resolve(mapOf("asked" to recorder.asked))
      }
    })
  }

  override fun definition() = ModuleDefinition {
    Name("NoterivClientCertificate")

    // Opens the system's own list of installed certificates. The answer is
    // the name of the one that was picked, or null when the list was closed.
    // Picking one is also what allows this app to use it.
    AsyncFunction("choose") { host: String?, port: Int, current: String?, promise: Promise ->
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      activity.runOnUiThread {
        try {
          KeyChain.choosePrivateKeyAlias(
            activity,
            { alias -> promise.resolve(alias as Any?) },
            arrayOf("RSA", "EC"),
            null,
            host?.takeIf { it.isNotEmpty() },
            if (port > 0) port else -1,
            current
          )
        } catch (e: RuntimeException) {
          promise.reject(RequestFailedException(reasonOf(e)))
        }
      }
    }

    AsyncFunction("describe") { alias: String ->
      describe(alias)
    }

    AsyncFunction("request") { options: RequestOptions, body: ByteArray?, promise: Promise ->
      start(options, body, promise)
    }

    AsyncFunction("cancel") { id: String ->
      calls.remove(id)?.cancel()
    }

    AsyncFunction("probe") { host: String, port: Int, promise: Promise ->
      probe(host, port, promise)
    }

    AsyncFunction("forget") {
      forget()
    }

    OnDestroy {
      for (call in calls.values) call.cancel()
      calls.clear()
      forget()
    }
  }
}
