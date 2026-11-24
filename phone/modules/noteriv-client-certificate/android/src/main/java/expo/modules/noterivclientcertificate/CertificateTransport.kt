package expo.modules.noterivclientcertificate

import android.content.Context
import android.os.SystemClock
import android.security.KeyChain
import android.security.KeyChainException
import okhttp3.OkHttpClient
import java.net.InetAddress
import java.net.Socket
import java.security.KeyStore
import java.security.Principal
import java.security.PrivateKey
import java.security.cert.X509Certificate
import java.util.Collections
import java.util.WeakHashMap
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLEngine
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509ExtendedKeyManager
import javax.net.ssl.X509TrustManager

/**
 * The trust manager every other connection of the app already uses: the
 * system's certificate authorities plus the ones the owner of the phone
 * installed, as the app's network security config says. Which servers are
 * trusted is not changed by anything in this module.
 */
internal fun platformTrustManager(): X509TrustManager {
  val factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
  factory.init(null as KeyStore?)
  return factory.trustManagers.filterIsInstance<X509TrustManager>().single()
}

/** Which server each secure connection was opened to, so a key manager can tell who is asking. */
internal class SocketHosts {
  private val hosts = Collections.synchronizedMap(WeakHashMap<Socket, Pair<String, Int>>())

  fun remember(socket: Socket, host: String?, port: Int) {
    if (host != null) hosts[socket] = host to port
  }

  fun hostOf(socket: Socket): Pair<String, Int>? = hosts[socket]
}

/** The system's socket factory, noting for each socket which server it leads to. */
internal class HostRecordingSocketFactory(
  private val delegate: SSLSocketFactory,
  private val hosts: SocketHosts
) : SSLSocketFactory() {
  override fun getDefaultCipherSuites(): Array<String> = delegate.defaultCipherSuites

  override fun getSupportedCipherSuites(): Array<String> = delegate.supportedCipherSuites

  override fun createSocket(): Socket = delegate.createSocket()

  override fun createSocket(socket: Socket?, host: String?, port: Int, autoClose: Boolean): Socket =
    delegate.createSocket(socket, host, port, autoClose).also { hosts.remember(it, host, port) }

  override fun createSocket(host: String?, port: Int): Socket =
    delegate.createSocket(host, port).also { hosts.remember(it, host, port) }

  override fun createSocket(host: String?, port: Int, localHost: InetAddress?, localPort: Int): Socket =
    delegate.createSocket(host, port, localHost, localPort).also { hosts.remember(it, host, port) }

  // Opened by address alone: the server's name is not known, so nothing is noted
  // and such a connection is never shown a certificate.
  override fun createSocket(host: InetAddress?, port: Int): Socket = delegate.createSocket(host, port)

  override fun createSocket(address: InetAddress?, port: Int, localAddress: InetAddress?, localPort: Int): Socket =
    delegate.createSocket(address, port, localAddress, localPort)
}

/**
 * Answers a server's request for a client certificate with one certificate
 * from the phone's own store (Settings > Security > Encryption & credentials),
 * and only for one server: the host and port it was made for. Any other
 * server that asks gets no certificate.
 */
internal class KeyChainKeyManager(
  private val context: Context,
  private val host: String,
  private val port: Int,
  val alias: String,
  private val hosts: SocketHosts
) : X509ExtendedKeyManager() {
  /** When a server last asked for a certificate, on the clock of [SystemClock.elapsedRealtime]. 0 is never. */
  @Volatile
  var askedAt = 0L
    private set

  /** When the certificate was last shown to the server. */
  @Volatile
  var offeredAt = 0L
    private set

  /** When the server last asked and the certificate could not be read from the phone's store. */
  @Volatile
  var unavailableAt = 0L
    private set

  private var chain: Array<X509Certificate>? = null
  private var key: PrivateKey? = null

  @Synchronized
  private fun load(): Boolean {
    if (chain != null && key != null) return true
    return try {
      val loadedKey = KeyChain.getPrivateKey(context, alias)
      val loadedChain = KeyChain.getCertificateChain(context, alias)
      if (loadedKey == null || loadedChain.isNullOrEmpty()) {
        false
      } else {
        key = loadedKey
        chain = loadedChain
        true
      }
    } catch (e: KeyChainException) {
      false
    } catch (e: InterruptedException) {
      Thread.currentThread().interrupt()
      false
    } catch (e: RuntimeException) {
      false
    }
  }

  private fun answer(peerHost: String?, peerPort: Int): String? {
    val now = SystemClock.elapsedRealtime()
    askedAt = now
    if (peerHost == null || !peerHost.equals(host, ignoreCase = true) || peerPort != port) return null
    if (!load()) {
      unavailableAt = now
      return null
    }
    offeredAt = now
    return alias
  }

  override fun chooseClientAlias(keyTypes: Array<out String>?, issuers: Array<out Principal>?, socket: Socket?): String? {
    val peer = socket?.let { hosts.hostOf(it) }
    return answer(peer?.first, peer?.second ?: -1)
  }

  override fun chooseEngineClientAlias(keyTypes: Array<out String>?, issuers: Array<out Principal>?, engine: SSLEngine?): String? =
    answer(engine?.peerHost, engine?.peerPort ?: -1)

  override fun getCertificateChain(alias: String?): Array<X509Certificate>? =
    if (alias == this.alias && load()) chain else null

  override fun getPrivateKey(alias: String?): PrivateKey? =
    if (alias == this.alias && load()) key else null

  override fun getClientAliases(keyType: String?, issuers: Array<out Principal>?): Array<String> = arrayOf(alias)

  // This app is never the server of a connection.
  override fun getServerAliases(keyType: String?, issuers: Array<out Principal>?): Array<String>? = null

  override fun chooseServerAlias(keyType: String?, issuers: Array<out Principal>?, socket: Socket?): String? = null
}

/** Notes whether a server asked for a client certificate, and never gives one. */
internal class AskRecorder : X509ExtendedKeyManager() {
  @Volatile
  var asked = false
    private set

  override fun chooseClientAlias(keyTypes: Array<out String>?, issuers: Array<out Principal>?, socket: Socket?): String? {
    asked = true
    return null
  }

  override fun chooseEngineClientAlias(keyTypes: Array<out String>?, issuers: Array<out Principal>?, engine: SSLEngine?): String? {
    asked = true
    return null
  }

  override fun getCertificateChain(alias: String?): Array<X509Certificate>? = null

  override fun getPrivateKey(alias: String?): PrivateKey? = null

  override fun getClientAliases(keyType: String?, issuers: Array<out Principal>?): Array<String>? = null

  override fun getServerAliases(keyType: String?, issuers: Array<out Principal>?): Array<String>? = null

  override fun chooseServerAlias(keyType: String?, issuers: Array<out Principal>?, socket: Socket?): String? = null
}

/**
 * The connections to one server that are allowed to show one certificate.
 *
 * It is a network client of its own. The rest of the app (Git sync, images,
 * WebDAV sync of a vault with no certificate) keeps the client it always had
 * and can never show a certificate to anyone.
 */
internal class CertificateTransport(context: Context, val host: String, val port: Int, val alias: String) {
  val keyManager: KeyChainKeyManager
  val client: OkHttpClient

  init {
    val hosts = SocketHosts()
    keyManager = KeyChainKeyManager(context, host, port, alias, hosts)
    val trustManager = platformTrustManager()
    val sslContext = SSLContext.getInstance("TLS")
    sslContext.init(arrayOf(keyManager), arrayOf(trustManager), null)
    client = OkHttpClient.Builder()
      .sslSocketFactory(HostRecordingSocketFactory(sslContext.socketFactory, hosts), trustManager)
      // A redirect is never followed: on the way to another address an upload
      // would become a plain download, and the certificate must not follow it either.
      .followRedirects(false)
      .followSslRedirects(false)
      // The app's own timers end a request that takes too long, as they do
      // for every other WebDAV request; this is only the last resort.
      .connectTimeout(0, TimeUnit.MILLISECONDS)
      .readTimeout(0, TimeUnit.MILLISECONDS)
      .writeTimeout(0, TimeUnit.MILLISECONDS)
      .callTimeout(15, TimeUnit.MINUTES)
      .build()
  }

  fun matches(host: String, port: Int, alias: String): Boolean =
    this.host.equals(host, ignoreCase = true) && this.port == port && this.alias == alias

  fun close() {
    client.connectionPool.evictAll()
  }
}
