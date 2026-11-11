cask "noteriv" do
  version "2.4.8"
  sha256 "a1ec8ce39e6e7935ee066723ac219bea2fc08bbb1bff85e656a6d6cc1d618473"

  url "https://github.com/thejacedev/Noteriv/releases/download/v#{version}/Noteriv_#{version}_universal.dmg",
      verified: "github.com/thejacedev/Noteriv/"
  name "Noteriv"
  desc "Markdown editor with graph view, plugins, themes and Git/WebDAV sync"
  homepage "https://www.noteriv.com/"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on :macos

  app "Noteriv.app"

  zap trash: [
    "~/Library/Application Support/com.noteriv.Noteriv",
    "~/Library/Caches/com.noteriv.Noteriv",
    "~/Library/Preferences/com.noteriv.Noteriv.plist",
    "~/Library/Saved Application State/com.noteriv.Noteriv.savedState",
    "~/Library/WebKit/com.noteriv.Noteriv",
  ]
end
