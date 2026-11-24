package expo.modules.webdavcertificates

import android.app.Activity
import android.app.Application
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.security.KeyChain
import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import java.lang.ref.WeakReference
import java.net.Socket
import java.security.KeyStore
import java.security.Principal
import java.security.PrivateKey
import java.security.cert.X509Certificate
import java.security.cert.CertificateExpiredException
import java.security.cert.CertificateNotYetValidException
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLEngine
import javax.net.ssl.SSLHandshakeException
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509ExtendedKeyManager
import javax.net.ssl.X509TrustManager
import okhttp3.Call
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody
import okio.Buffer
import okio.ForwardingSource
import okio.buffer

object WebDavCertificates {
  private const val HEADER = "X-Noteriv-WebDAV-Certificate"
  private const val PICKER_TIMEOUT_SECONDS = 90L
  private lateinit var application: Application
  private val preferences by lazy {
    application.getSharedPreferences("webdav-client-certificates", Application.MODE_PRIVATE)
  }
  private val mainHandler = Handler(Looper.getMainLooper())
  private var activity = WeakReference<Activity>(null)
  private val requests = ThreadLocal<CertificateRequest>()
  private val selections = ConcurrentHashMap<String, CompletableFuture<String?>>()
  private val clients = ConcurrentHashMap<String, OkHttpClient>()
  private val cancellationMonitor = Executors.newSingleThreadScheduledExecutor()

  fun install(app: Application) {
    application = app
    observeKeyChain()
    app.registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
      override fun onActivityResumed(current: Activity) {
        activity = WeakReference(current)
      }

      override fun onActivityPaused(current: Activity) {
        if (activity.get() === current) {
          activity.clear()
        }
      }

      override fun onActivityCreated(current: Activity, state: Bundle?) {}
      override fun onActivityStarted(current: Activity) {}
      override fun onActivityStopped(current: Activity) {}
      override fun onActivitySaveInstanceState(current: Activity, state: Bundle) {}
      override fun onActivityDestroyed(current: Activity) {}
    })
    OkHttpClientProvider.setOkHttpClientFactory(OkHttpClientFactory {
      OkHttpClientProvider.createClientBuilder(application)
        .addInterceptor { chain ->
          val request = chain.request()
          val mode = request.header(HEADER)
          val cleanRequest = request.newBuilder().removeHeader(HEADER).build()
          val isWebDav = request.url.isHttps && (mode == "interactive" || mode == "cached")
          if (!isWebDav) {
            chain.proceed(cleanRequest)
          } else {
            send(chain, cleanRequest, mode == "interactive")
          }
        }
        .build()
    })
  }

  private fun send(
    outer: Interceptor.Chain,
    request: Request,
    canPrompt: Boolean,
    canRetry: Boolean = true,
  ): Response {
    val origin = origin(request.url)
    val client = clients.computeIfAbsent(origin) { createClient() }
    val call = client.newCall(request)
    val monitor = cancellationMonitor.scheduleAtFixedRate({
      if (outer.call().isCanceled()) {
        call.cancel()
      }
    }, 0, 100, TimeUnit.MILLISECONDS)
    val selection = CertificateRequest(request.url, canPrompt, call)
    requests.set(selection)
    try {
      val response = call.execute()
      val body = response.body
      if (body == null) {
        monitor.cancel(false)
        return response
      }
      return response.newBuilder().body(monitoredBody(body, monitor)).build()
    } catch (error: Exception) {
      monitor.cancel(false)
      if (isRejectedCertificate(selection, error)) {
        preferences.edit().remove(origin).apply()
        clients.remove(origin, client)
        client.connectionPool.evictAll()
        if (canPrompt && canRetry && !selection.hasPrompted && !outer.call().isCanceled()) {
          return send(outer, request, canPrompt, canRetry = false)
        }
      }
      throw error
    } finally {
      requests.remove()
    }
  }

  private fun isRejectedCertificate(request: CertificateRequest, error: Exception): Boolean {
    if (request.credentials == null || error !is SSLHandshakeException) {
      return false
    }
    val alerts = listOf("bad_certificate", "certificate_unknown", "certificate_expired", "certificate_revoked", "unknown_ca")
    val message = error.message.orEmpty()
    return alerts.any { message.contains(it, ignoreCase = true) }
  }

  private fun observeKeyChain() {
    val filter = IntentFilter().apply {
      addAction(KeyChain.ACTION_KEYCHAIN_CHANGED)
      addAction(KeyChain.ACTION_KEY_ACCESS_CHANGED)
    }
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == KeyChain.ACTION_KEY_ACCESS_CHANGED &&
          !intent.getBooleanExtra(KeyChain.EXTRA_KEY_ACCESSIBLE, false)) {
          val alias = intent.getStringExtra(KeyChain.EXTRA_KEY_ALIAS)
          val editor = preferences.edit()
          for ((origin, selected) in preferences.all) {
            if (selected == alias) {
              editor.remove(origin)
            }
          }
          editor.apply()
        }
        val previous = clients.values.toList()
        clients.clear()
        for (client in previous) {
          client.connectionPool.evictAll()
        }
      }
    }
    if (Build.VERSION.SDK_INT >= 33) {
      application.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      application.registerReceiver(receiver, filter)
    }
  }

  private fun createClient(): OkHttpClient {
    val trustFactory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
    trustFactory.init(null as KeyStore?)
    val trustManager = trustFactory.trustManagers.filterIsInstance<X509TrustManager>().single()
    val context = SSLContext.getInstance("TLS")
    context.init(arrayOf(ClientKeyManager()), arrayOf(trustManager), null)
    val client = OkHttpClientProvider.createClientBuilder()
      .sslSocketFactory(context.socketFactory, trustManager)
      .cookieJar(CookieJar.NO_COOKIES)
      .followRedirects(false)
      .followSslRedirects(false)
      .build()
    return client
  }

  private fun origin(url: HttpUrl): String = "${url.host}:${url.port}"

  private fun monitoredBody(body: ResponseBody, monitor: ScheduledFuture<*>): ResponseBody {
    val source = object : ForwardingSource(body.source()) {
      override fun read(sink: Buffer, byteCount: Long): Long {
        try {
          val count = super.read(sink, byteCount)
          if (count == -1L) {
            monitor.cancel(false)
          }
          return count
        } catch (error: Exception) {
          monitor.cancel(false)
          throw error
        }
      }

      override fun close() {
        try {
          super.close()
        } finally {
          monitor.cancel(false)
        }
      }
    }.buffer()
    return object : ResponseBody() {
      override fun contentType() = body.contentType()
      override fun contentLength() = body.contentLength()
      override fun source() = source
    }
  }

  private class Credentials(
    val alias: String,
    val privateKey: PrivateKey,
    val chain: Array<X509Certificate>,
  )

  private class CertificateRequest(
    val url: HttpUrl,
    val canPrompt: Boolean,
    val call: Call,
  ) {
    var hasAttemptedSelection = false
    var hasPrompted = false
    var credentials: Credentials? = null
  }

  private class ClientKeyManager : X509ExtendedKeyManager() {
    override fun chooseClientAlias(
      keyTypes: Array<String>,
      issuers: Array<Principal>?,
      socket: Socket?,
    ): String? = chooseAlias(keyTypes, issuers)

    override fun chooseEngineClientAlias(
      keyTypes: Array<String>,
      issuers: Array<Principal>?,
      engine: SSLEngine?,
    ): String? = chooseAlias(keyTypes, issuers)

    override fun getPrivateKey(alias: String): PrivateKey? =
      requests.get()?.credentials?.takeIf { it.alias == alias }?.privateKey

    override fun getCertificateChain(alias: String): Array<X509Certificate>? =
      requests.get()?.credentials?.takeIf { it.alias == alias }?.chain

    override fun getClientAliases(keyType: String?, issuers: Array<Principal>?): Array<String>? = null
    override fun getServerAliases(keyType: String?, issuers: Array<Principal>?): Array<String>? = null
    override fun chooseServerAlias(keyType: String?, issuers: Array<Principal>?, socket: Socket?): String? = null
  }

  private fun chooseAlias(keyTypes: Array<String>, issuers: Array<Principal>?): String? {
    val request = requests.get() ?: return null
    if (request.hasAttemptedSelection) {
      return request.credentials?.alias
    }
    request.hasAttemptedSelection = true
    val origin = origin(request.url)
    val savedAlias = preferences.getString(origin, null)
    if (savedAlias != null) {
      val credentials = loadCredentials(savedAlias)
      if (credentials != null && matches(credentials, keyTypes, issuers)) {
        request.credentials = credentials
        return savedAlias
      }
      preferences.edit().remove(origin).apply()
    }
    if (!request.canPrompt) {
      throw SSLHandshakeException("Client certificate selection needed. Use WebDAV Sync Now to choose a certificate.")
    }
    request.hasPrompted = true
    val alias = selectAlias(request, keyTypes, issuers)
      ?: throw SSLHandshakeException("Client certificate selection was cancelled or no matching certificate is installed.")
    val credentials = loadCredentials(alias)
      ?: throw SSLHandshakeException("The selected client certificate is no longer accessible.")
    if (!matches(credentials, keyTypes, issuers)) {
      throw SSLHandshakeException("The selected client certificate does not match the server's request.")
    }
    request.credentials = credentials
    preferences.edit().putString(origin, alias).apply()
    return alias
  }

  private fun loadCredentials(alias: String): Credentials? {
    try {
      val privateKey = KeyChain.getPrivateKey(application, alias) ?: return null
      val chain = KeyChain.getCertificateChain(application, alias) ?: return null
      if (chain.isEmpty()) {
        return null
      }
      for (certificate in chain) {
        certificate.checkValidity()
      }
      return Credentials(alias, privateKey, chain)
    } catch (_: SecurityException) {
      return null
    } catch (_: CertificateExpiredException) {
      return null
    } catch (_: CertificateNotYetValidException) {
      return null
    }
  }

  private fun matches(credentials: Credentials, keyTypes: Array<String>, issuers: Array<Principal>?): Boolean {
    val hasKeyType = keyTypes.any { it.substringBefore('_') == credentials.privateKey.algorithm }
    val hasIssuer = issuers.isNullOrEmpty() || credentials.chain.any { certificate ->
      issuers.any { it == certificate.issuerX500Principal }
    }
    return hasKeyType && hasIssuer
  }

  private fun selectAlias(
    request: CertificateRequest,
    keyTypes: Array<String>,
    issuers: Array<Principal>?,
  ): String? {
    val origin = origin(request.url)
    val proposed = CompletableFuture<String?>()
    val pending = selections.putIfAbsent(origin, proposed) ?: proposed
    if (pending === proposed) {
      mainHandler.post {
        val current = activity.get()
        if (pending.isDone || current == null || current.isFinishing || current.isDestroyed) {
          pending.completeExceptionally(SSLHandshakeException("Open Noteriv and use WebDAV Sync Now to choose a certificate."))
          selections.remove(origin, pending)
        } else {
          try {
            KeyChain.choosePrivateKeyAlias(
              current,
              { alias ->
                pending.complete(alias)
                selections.remove(origin, pending)
              },
              keyTypes,
              issuers,
              request.url.host,
              request.url.port,
              null,
            )
          } catch (error: RuntimeException) {
            pending.completeExceptionally(error)
            selections.remove(origin, pending)
          }
        }
      }
    }
    val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(PICKER_TIMEOUT_SECONDS)
    while (System.nanoTime() < deadline) {
      if (request.call.isCanceled()) {
        throw SSLHandshakeException("Client certificate request cancelled.")
      }
      try {
        return pending.get(200, TimeUnit.MILLISECONDS)
      } catch (_: TimeoutException) {
        // Keep cancellation responsive while Android owns the picker.
      }
    }
    pending.completeExceptionally(SSLHandshakeException("Client certificate selection timed out."))
    selections.remove(origin, pending)
    throw SSLHandshakeException("Client certificate selection timed out.")
  }
}
