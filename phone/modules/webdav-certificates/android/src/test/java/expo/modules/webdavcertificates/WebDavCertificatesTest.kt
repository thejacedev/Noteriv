package expo.modules.webdavcertificates

import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.Intent
import android.security.KeyChain
import android.security.KeyChainAliasCallback
import com.facebook.react.modules.network.OkHttpClientProvider
import java.io.File
import java.security.KeyStore
import java.security.Principal
import java.security.PrivateKey
import java.security.cert.X509Certificate
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.Implementation
import org.robolectric.annotation.Implements
import org.robolectric.shadows.ShadowLooper

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], shadows = [TestKeyChain::class])
class WebDavCertificatesTest {
  private lateinit var server: MockWebServer
  private lateinit var trustStore: File
  private lateinit var application: Application
  private val workers = Executors.newCachedThreadPool()
  private val trustProperties = listOf("javax.net.ssl.trustStore", "javax.net.ssl.trustStorePassword", "javax.net.ssl.trustStoreType")
  private val previousTrustProperties = trustProperties.associateWith { System.getProperty(it) }

  @Before
  fun setUp() {
    val authority = HeldCertificate.Builder().certificateAuthority(1).commonName("Test CA").build()
    val serverCertificate = HeldCertificate.Builder().commonName("localhost")
      .addSubjectAlternativeName("localhost").signedBy(authority).build()
    TestKeyChain.certificate = HeldCertificate.Builder().commonName("Client").signedBy(authority).build()
    TestKeyChain.chain = arrayOf(TestKeyChain.certificate.certificate, authority.certificate)
    TestKeyChain.selection = "client"
    TestKeyChain.promptCount = 0
    TestKeyChain.inaccessibleAlias = ""
    TestKeyChain.chainsByAlias = emptyMap()

    val store = KeyStore.getInstance("JKS")
    store.load(null)
    store.setCertificateEntry("ca", authority.certificate)
    trustStore = File.createTempFile("webdav-trust", ".jks")
    trustStore.outputStream().use { store.store(it, "password".toCharArray()) }
    System.setProperty("javax.net.ssl.trustStore", trustStore.absolutePath)
    System.setProperty("javax.net.ssl.trustStorePassword", "password")
    System.setProperty("javax.net.ssl.trustStoreType", "JKS")

    server = MockWebServer()
    val serverTls = HandshakeCertificates.Builder()
      .heldCertificate(serverCertificate, authority.certificate)
      .addTrustedCertificate(authority.certificate).build()
    server.useHttps(serverTls.sslSocketFactory(), false)
    server.requireClientAuth()
    server.start()
    application = RuntimeEnvironment.getApplication()
    WebDavCertificates.install(application)
    Robolectric.buildActivity(Activity::class.java).setup()
  }

  @After
  fun tearDown() {
    server.shutdown()
    workers.shutdownNow()
    trustStore.delete()
    for ((key, value) in previousTrustProperties) {
      if (value == null) {
        System.clearProperty(key)
      } else {
        System.setProperty(key, value)
      }
    }
  }

  @Test
  fun selectsOnceAndReusesCertificateWithoutLeakingInternalHeader() {
    server.enqueue(MockResponse().setBody("first"))
    server.enqueue(MockResponse().setBody("second"))
    assertEquals("first", execute("interactive"))
    assertEquals("second", execute("cached"))
    assertEquals(1, TestKeyChain.promptCount)
    val received = server.takeRequest()
    assertNull(received.getHeader("X-Noteriv-WebDAV-Certificate"))
    assertEquals(TestKeyChain.certificate.certificate, received.handshake!!.peerCertificates.first())
  }

  @Test
  fun autoSyncDoesNotOpenPickerWithoutSavedCertificate() {
    assertThrows(Exception::class.java) { execute("cached") }
    assertEquals(0, TestKeyChain.promptCount)
  }

  @Test
  fun promptsAgainWhenSavedAliasIsNoLongerAccessible() {
    val origin = "${server.hostName}:${server.port}"
    application.getSharedPreferences("webdav-client-certificates", Context.MODE_PRIVATE)
      .edit().putString(origin, "removed").commit()
    TestKeyChain.inaccessibleAlias = "removed"
    server.enqueue(MockResponse().setBody("reselected"))
    assertEquals("reselected", execute("interactive"))
    assertEquals(1, TestKeyChain.promptCount)
  }

  @Test
  fun replacesExpiredSelectionBeforeSendingItToTheServer() {
    val expired = HeldCertificate.Builder().commonName("Expired")
      .validityInterval(0, 1000).build()
    TestKeyChain.chainsByAlias = mapOf("expired" to arrayOf(expired.certificate))
    val origin = "${server.hostName}:${server.port}"
    application.getSharedPreferences("webdav-client-certificates", Context.MODE_PRIVATE)
      .edit().putString(origin, "expired").commit()
    server.enqueue(MockResponse().setBody("renewed"))
    assertEquals("renewed", execute("interactive"))
    assertEquals(1, TestKeyChain.promptCount)
  }

  @Test
  fun revokedAccessDiscardsPooledConnectionsAndPromptsOnNextManualSync() {
    server.enqueue(MockResponse().setBody("before"))
    server.enqueue(MockResponse().setBody("after"))
    assertEquals("before", execute("interactive"))
    TestKeyChain.inaccessibleAlias = "client"
    TestKeyChain.selection = "replacement"
    application.sendBroadcast(Intent(KeyChain.ACTION_KEY_ACCESS_CHANGED)
      .putExtra(KeyChain.EXTRA_KEY_ALIAS, "client")
      .putExtra(KeyChain.EXTRA_KEY_ACCESSIBLE, false))
    ShadowLooper.idleMainLooper()
    assertEquals("after", execute("interactive"))
    assertEquals(2, TestKeyChain.promptCount)
  }

  @Test
  fun doesNotFollowRedirects() {
    server.enqueue(MockResponse().setResponseCode(302)
      .setHeader("Location", server.url("/elsewhere")).setBody("redirect"))
    server.enqueue(MockResponse().setBody("incorrectly followed"))
    assertEquals("redirect", execute("interactive"))
    assertEquals(1, server.requestCount)
  }

  @Test
  fun unrelatedRequestsCannotReuseTheAuthenticatedConnection() {
    server.enqueue(MockResponse().setBody("authenticated"))
    assertEquals("authenticated", execute("interactive"))
    assertThrows(Exception::class.java) { execute("") }
    assertEquals(1, TestKeyChain.promptCount)
  }

  @Test
  fun preservesWebDavMethodsAndBinaryBodies() {
    val bytes = byteArrayOf(0, 1, -1, -128, 65)
    server.enqueue(MockResponse().setBody("uploaded"))
    val request = Request.Builder().url(server.url("/note.bin"))
      .header("X-Noteriv-WebDAV-Certificate", "interactive")
      .method("PUT", bytes.toRequestBody()).build()
    assertEquals("uploaded", execute(request))
    val received = server.takeRequest()
    assertEquals("PUT", received.method)
    assertArrayEquals(bytes, received.body.readByteArray())
  }

  @Test
  fun cancellationDoesNotSaveAnAlias() {
    TestKeyChain.selection = null
    assertThrows(Exception::class.java) { execute("interactive") }
    assertEquals(1, TestKeyChain.promptCount)
    assertTrue(application.getSharedPreferences("webdav-client-certificates", Context.MODE_PRIVATE).all.isEmpty())
  }

  private fun execute(mode: String): String {
    val request = Request.Builder().url(server.url("/dav/"))
    if (mode.isNotEmpty()) {
      request.header("X-Noteriv-WebDAV-Certificate", mode)
    }
    return execute(request.build())
  }

  private fun execute(request: Request): String {
    val client = OkHttpClientProvider.createClient(application)
      .newBuilder().callTimeout(10, TimeUnit.SECONDS).build()
    val result = workers.submit<String> {
      client.newCall(request).execute().use { it.body!!.string() }
    }
    val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15)
    while (!result.isDone && System.nanoTime() < deadline) {
      ShadowLooper.idleMainLooper()
      Thread.sleep(10)
    }
    return result.get(1, TimeUnit.SECONDS)
  }
}

@Implements(KeyChain::class)
class TestKeyChain {
  companion object {
    lateinit var certificate: HeldCertificate
    lateinit var chain: Array<X509Certificate>
    var selection: String? = "client"
    var promptCount = 0
    var inaccessibleAlias = ""
    var chainsByAlias: Map<String, Array<X509Certificate>> = emptyMap()

    @JvmStatic
    @Implementation
    fun getPrivateKey(context: Context, alias: String): PrivateKey? {
      return if (alias == inaccessibleAlias) null else certificate.keyPair.private
    }

    @JvmStatic
    @Implementation
    fun getCertificateChain(context: Context, alias: String): Array<X509Certificate> = chainsByAlias[alias] ?: chain

    @JvmStatic
    @Implementation
    fun choosePrivateKeyAlias(
      activity: Activity,
      callback: KeyChainAliasCallback,
      keyTypes: Array<String>?,
      issuers: Array<Principal>?,
      host: String?,
      port: Int,
      alias: String?,
    ) {
      promptCount += 1
      callback.alias(selection)
    }
  }
}
