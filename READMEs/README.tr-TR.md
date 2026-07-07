<p align="center">
  <img src="../assets/banner.png" alt="agentmemory — AI kodlama ajanları için kalıcı bellek" width="720" />
</p>

<p align="center">
  <strong>
    Kodlama ajanınız her şeyi hatırlasın. Aynı şeyi bir daha açıklamayın.
    Built on <a href="https://github.com/iii-hq/iii">iii engine</a>
  </strong><br/>
  Claude Code, Cursor, Gemini CLI, Codex CLI, Hermes, OpenClaw, pi, OpenCode ve her MCP istemcisi için kalıcı bellek.
</p>

<p align="center">
  <a href="../README.md">English</a> |
  <a href="README.zh-CN.md">简体中文</a> |
  <a href="README.zh-TW.md">繁體中文</a> |
  <a href="README.ja-JP.md">日本語</a> |
  <a href="README.ko-KR.md">한국어</a> |
  <a href="README.es-ES.md">Español</a> |
  Türkçe |
  <a href="README.ru-RU.md">Русский</a> |
  <a href="README.hi-IN.md">हिन्दी</a> |
  <a href="README.pt-BR.md">Português</a> |
  <a href="README.fr-FR.md">Français</a> |
  <a href="README.de-DE.md">Deutsch</a>
</p>

<p align="center">
  <a href="https://trendshift.io/repositories/25123" target="_blank"><img src="https://trendshift.io/api/badge/repositories/25123" alt="rohitg00/agentmemory | Trendshift" width="250" height="55"/></a>
</p>

<p align="center">
  <a href="https://www.star-history.com/?repos=rohitg00%2Fagentmemory&type=date&legend=top-left">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=rohitg00/agentmemory&type=date&theme=dark&legend=top-left" />
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=rohitg00/agentmemory&type=date&legend=top-left" />
      <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=rohitg00/agentmemory&type=date&legend=top-left" />
    </picture>
  </a>
</p>

<p align="center">
  <a href="https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2"><img src="https://img.shields.io/badge/Viral%20GitHub%20Gist-1200%20stars%20%2F%20172%20forks-FF6B35?style=for-the-badge&logo=github&logoColor=white&labelColor=1a1a1a" alt="Design doc: 1200 stars / 172 forks on the gist" /></a>
</p>

<p align="center">
  <em>Bu gist, Karpathy'nin LLM Wiki desenini güven puanlaması, yaşam döngüsü, bilgi grafları ve hibrit aramayla genişletir: agentmemory bunun uygulamasıdır.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@agentmemory/agentmemory"><img src="https://img.shields.io/npm/v/@agentmemory/agentmemory?color=CB3837&label=npm&style=for-the-badge&logo=npm" alt="npm version" /></a>
  <a href="https://github.com/rohitg00/agentmemory/actions"><img src="https://img.shields.io/github/actions/workflow/status/rohitg00/agentmemory/ci.yml?label=tests&style=for-the-badge&logo=github" alt="CI" /></a>
  <a href="https://github.com/rohitg00/agentmemory/blob/main/LICENSE"><img src="https://img.shields.io/github/license/rohitg00/agentmemory?color=blue&style=for-the-badge" alt="License" /></a>
  <a href="https://github.com/rohitg00/agentmemory/stargazers"><img src="https://img.shields.io/github/stars/rohitg00/agentmemory?style=for-the-badge&color=yellow&logo=github" alt="Stars" /></a>
</p>

<p align="center">
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-recall.svg"><img src="../assets/tags/stat-recall.svg" alt="95.2% retrieval R@5" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tokens.svg"><img src="../assets/tags/stat-tokens.svg" alt="92% fewer tokens" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tools.svg"><img src="../assets/tags/stat-tools.svg" alt="53 MCP tools" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-hooks.svg"><img src="../assets/tags/stat-hooks.svg" alt="12 auto hooks" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-deps.svg"><img src="../assets/tags/stat-deps.svg" alt="0 external DBs" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tests.svg"><img src="../assets/tags/stat-tests.svg" alt="950+ tests passing" height="38" /></picture>
</p>

<p align="center">
  <img src="../assets/demo.gif" alt="agentmemory demo" width="720" />
</p>

<p align="center">
  <a href="#install">Kurulum</a> &bull;
  <a href="#quick-start">Hızlı Başlangıç</a> &bull;
  <a href="#benchmarks">Kıyaslamalar</a> &bull;
  <a href="#vs-competitors">Rakiplerle Karşılaştırma</a> &bull;
  <a href="#works-with-every-agent">Ajanlar</a> &bull;
  <a href="#how-it-works">Nasıl Çalışır</a> &bull;
  <a href="#mcp-server">MCP</a> &bull;
  <a href="#real-time-viewer">Görüntüleyici</a> &bull;
  <a href="#iii-console">iii Konsolu</a> &bull;
  <a href="#powered-by-iii">iii ile çalışır</a> &bull;
  <a href="#configuration">Yapılandırma</a> &bull;
  <a href="#api">API</a>
</p>

---

## Kurulum

```bash
npm install -g @agentmemory/agentmemory          # bir kez — `agentmemory` PATH'te kullanılabilir
# macOS/Linux sistem Node kurulumlarında EACCES hatası alırsanız şununla deneyin:
# sudo npm install -g @agentmemory/agentmemory
agentmemory                                      # bellek sunucusunu :3111 üzerinde başlat
agentmemory demo                                 # örnek oturumlar yükle + recall'u kanıtla
agentmemory connect claude-code                  # ajanınızı bağlayın (ayrıca: codex, cursor, gemini-cli, ...)
```

Veya `npx` ile (kurulum gerekmez):

```bash
npx @agentmemory/agentmemory
```

Dikkat — npx sürüm bazında önbelleğe alır. Eğer çıplak bir `npx @agentmemory/agentmemory` eski bir sürümü servis ediyorsa, en güncelini `npx -y @agentmemory/agentmemory@latest` ile zorlayın veya önbelleği `rm -rf ~/.npm/_npx` ile bir kez temizleyin (macOS/Linux; Windows'ta `%LOCALAPPDATA%\npm-cache\_npx` dizinini silin). v0.9.16+ sonrası ilk npx çalıştırması, çıplak `agentmemory` komutunun her yerden çalışması için global kurulum yapmanızı satır içi olarak sorar.

Tüm seçenekler aşağıdaki [Hızlı Başlangıç](#quick-start) bölümünde. Ajana özel bağlantılar için [Her ajanla çalışır](#works-with-every-agent) bölümüne bakın.

---

<h2 id="works-with-every-agent"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-agents.svg"><img src="../assets/tags/section-agents.svg" alt="Works with every agent" height="32" /></picture></h2>

agentmemory; hook'ları, MCP'yi veya REST API'yi destekleyen her ajanla çalışır. Tüm ajanlar aynı bellek sunucusunu paylaşır.

<table>
<tr>
<td align="center" width="12.5%">
<a href="https://claude.com/product/claude-code"><img src="https://matthiasroder.com/content/images/2026/01/Claude.png?size=120" alt="Claude Code" width="48" height="48" /></a><br/>
<strong>Claude Code</strong><br/>
<sub>yerel eklenti + 12 hook + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/openai/codex"><img src="https://github.com/openai.png?size=120" alt="Codex CLI" width="48" height="48" /></a><br/>
<strong>Codex CLI</strong><br/>
<sub>yerel eklenti + 6 hook + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="../integrations/openclaw/"><img src="https://github.com/openclaw.png?size=120" alt="OpenClaw" width="48" height="48" /></a><br/>
<strong>OpenClaw</strong><br/>
<sub>yerel eklenti + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="../integrations/hermes/"><img src="https://github.com/NousResearch.png?size=120" alt="Hermes" width="48" height="48" /></a><br/>
<strong>Hermes</strong><br/>
<sub>yerel eklenti + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="../integrations/pi/"><img src="../assets/agents/pi.svg" alt="pi" width="48" height="48" /></a><br/>
<strong>pi</strong><br/>
<sub>yerel eklenti + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/tinyhumansai/openhuman"><img src="https://raw.githubusercontent.com/tinyhumansai/openhuman/main/app/src-tauri/icons/128x128.png" alt="OpenHuman" width="48" height="48" /></a><br/>
<strong>OpenHuman</strong><br/>
<sub>yerel Memory trait arka uç</sub>
</td>
<td align="center" width="12.5%">
<a href="https://cursor.com"><img src="https://www.freelogovectors.net/wp-content/uploads/2025/06/cursor-logo-freelogovectors.net_.png" alt="Cursor" width="48" height="48" /></a><br/>
<strong>Cursor</strong><br/>
<sub>MCP sunucusu</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/google-gemini/gemini-cli"><img src="https://github.com/google-gemini.png?size=120" alt="Gemini CLI" width="48" height="48" /></a><br/>
<strong>Gemini CLI</strong><br/>
<sub>MCP sunucusu</sub>
</td>
</tr>
<tr>
<td align="center" width="12.5%">
<a href="https://github.com/opencode-ai/opencode"><img src="https://github.com/opencode-ai.png?size=120" alt="OpenCode" width="48" height="48" /></a><br/>
<strong>OpenCode</strong><br/>
<sub>22 hook + MCP + eklenti</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/cline/cline"><img src="https://github.com/cline.png?size=120" alt="Cline" width="48" height="48" /></a><br/>
<strong>Cline</strong><br/>
<sub>MCP sunucusu</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/block/goose"><img src="https://github.com/block.png?size=120" alt="Goose" width="48" height="48" /></a><br/>
<strong>Goose</strong><br/>
<sub>MCP sunucusu</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/Kilo-Org/kilocode"><img src="https://github.com/Kilo-Org.png?size=120" alt="Kilo Code" width="48" height="48" /></a><br/>
<strong>Kilo Code</strong><br/>
<sub>MCP sunucusu</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/Aider-AI/aider"><img src="https://github.com/Aider-AI.png?size=120" alt="Aider" width="48" height="48" /></a><br/>
<strong>Aider</strong><br/>
<sub>REST API</sub>
</td>
<td align="center" width="12.5%">
<a href="https://claude.ai/download"><img src="https://github.com/anthropics.png?size=120" alt="Claude Desktop" width="48" height="48" /></a><br/>
<strong>Claude Desktop</strong><br/>
<sub>MCP sunucusu</sub>
</td>
<td align="center" width="12.5%">
<a href="https://windsurf.com"><img src="https://exafunction.github.io/public/brand/windsurf-black-symbol.svg?size=120" alt="Windsurf" width="48" height="48" /></a><br/>
<strong>Windsurf</strong><br/>
<sub>MCP sunucusu</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/RooCodeInc/Roo-Code"><img src="https://github.com/RooCodeInc.png?size=120" alt="Roo Code" width="48" height="48" /></a><br/>
<strong>Roo Code</strong><br/>
<sub>MCP sunucusu</sub>
</td>
</tr>
</table>

<p align="center">
  <sub>MCP veya HTTP konuşan <strong>herhangi bir</strong> ajanla çalışır. Tek sunucu, tüm ajanlar arasında paylaşılan bellek.</sub>
</p>

---

Her oturumda aynı mimariyi tekrar tekrar anlatıyorsunuz. Aynı bug'ları yeniden keşfediyorsunuz. Aynı tercihleri yeniden öğretiyorsunuz. Yerleşik bellek (CLAUDE.md, .cursorrules) 200 satırda tıkanır ve eskir. agentmemory bunu düzeltir. Ajanınızın yaptıklarını sessizce yakalar, aranabilir belleğe sıkıştırır ve bir sonraki oturum başladığında doğru bağlamı enjekte eder. Tek komut. Ajanlar arası çalışır.

**Neler değişiyor:** Oturum 1'de JWT kimlik doğrulamasını kuruyorsunuz. Oturum 2'de hız sınırlaması istiyorsunuz. Ajan zaten biliyor: kimlik doğrulamanız `src/middleware/auth.ts` içinde jose middleware kullanıyor, testleriniz token doğrulamasını kapsıyor ve Edge uyumluluğu için jsonwebtoken yerine jose'yi seçtiniz. Yeniden anlatma yok. Kopyala-yapıştır yok. Ajan basitçe *biliyor*.

```bash
npx @agentmemory/agentmemory
```

> **v0.9.0'da yeni** — [agent-memory.dev](https://agent-memory.dev) tanıtım sitesi, dosya sistemi bağlayıcısı (`@agentmemory/fs-watcher`), bağımsız MCP artık çalışan sunucuya proxy yapıyor (böylece hook'lar ve görüntüleyici hemfikir), her silme yolunda kodlanmış denetim politikası, küçük Node süreçlerinde sağlık `memory_critical` olarak işaretlenmiyor. Tüm notlar [CHANGELOG.md](../CHANGELOG.md#090--2026-04-18) içinde.

---

<h2 id="benchmarks"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-benchmarks.svg"><img src="../assets/tags/section-benchmarks.svg" alt="Benchmarks" height="32" /></picture></h2>

<table>
<tr>
<td width="50%">

### Geri Getirme Doğruluğu

**coding-agent-life-v1** (kurum içi corpus, sandbox-yeniden üretilebilir)

| Adaptör | P@5 | R@5 | Top-5 isabet oranı | p50 gecikme |
|---|---|---|---|---|
| **agentmemory hibrit** | **0.578** | **0.967** | **15 / 15** | 14 ms |
| grep referansı | 0.267 | 0.967 | 15 / 15 | 0 ms |

%100 Top-5 isabet oranı. Aynı girdide grep referansından **2.2×** daha iyi hassasiyet. Tam tip bazında döküm: [`docs/benchmarks/2026-05-20-coding-agent-life-v1.md`](../docs/benchmarks/2026-05-20-coding-agent-life-v1.md).

**LongMemEval-S** (ICLR 2025, 500 soru)

| Sistem | R@5 | R@10 | MRR |
|---|---|---|---|
| **agentmemory** | **95.2%** | **98.6%** | **88.2%** |
| Yalnız BM25 yedeği | 86.2% | 94.6% | 71.5% |

</td>
<td width="50%">

### Token Tasarrufu

| Yaklaşım | Token/yıl | Maliyet/yıl |
|---|---|---|
| Tam bağlamı yapıştır | 19.5M+ | İmkansız (pencereyi aşar) |
| LLM-özetlenmiş | ~650K | ~$500 |
| **agentmemory** | **~170K** | **~$10** |
| agentmemory + yerel embedding | ~170K | **$0** |

</td>
</tr>
</table>

> Embedding modeli: `all-MiniLM-L6-v2` (yerel, ücretsiz, API anahtarı gerekmez). Tam raporlar: [`benchmark/LONGMEMEVAL.md`](../benchmark/LONGMEMEVAL.md), [`benchmark/QUALITY.md`](../benchmark/QUALITY.md), [`benchmark/SCALE.md`](../benchmark/SCALE.md). Rakip karşılaştırması: [`benchmark/COMPARISON.md`](../benchmark/COMPARISON.md) — agentmemory'nin mem0, Letta, Khoj, claude-mem, Hippo ile karşılaştırması.

**Yerel olarak yeniden üretin:** [`eval/README.md`](../eval/README.md) — LongMemEval `_s` (genel 500 soru) + `coding-agent-life-v1` (kurum içi 15 oturum corpus) için adaptör-takılabilir harness. Grep / vektör / agentmemory adaptörleri yan yana puanlanır, NDJSON çıktısı, yayımlanan puan tabloları [`docs/benchmarks/`](../docs/benchmarks/) içine düşer.

**[codegraph](https://github.com/colbymchenry/codegraph), [Understand Anything](https://github.com/Lum1104/Understand-Anything) ve [Graphify](https://github.com/safishamsi/graphify) ile birlikte çalışır.** Kod-graf indeksleme, çok-ajanlı build pipeline'ları ve doküman / PDF / görsel / video boyunca daha geniş bilgi grafları. agentmemory çalışmayı hatırlar; bu üç proje bağlam katmanının geri kalanını aydınlatır. Tarifler + soru-yönlendirme tablosu: [`docs/recipes/pairings.md`](../docs/recipes/pairings.md).

---

<h2 id="vs-competitors"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-competitors.svg"><img src="../assets/tags/section-competitors.svg" alt="vs Competitors" height="32" /></picture></h2>

<table>
<tr>
<th width="20%"></th>
<th width="20%">agentmemory</th>
<th width="20%">mem0 (53K ⭐)</th>
<th width="20%">Letta / MemGPT (22K ⭐)</th>
<th width="20%">Yerleşik (CLAUDE.md)</th>
</tr>
<tr>
<td><strong>Tür</strong></td>
<td>Bellek motoru + MCP sunucusu</td>
<td>Bellek katmanı API'si</td>
<td>Tam ajan runtime'ı</td>
<td>Statik dosya</td>
</tr>
<tr>
<td><strong>Geri getirme R@5</strong></td>
<td><strong>95.2%</strong></td>
<td>68.5% (LoCoMo)</td>
<td>83.2% (LoCoMo)</td>
<td>N/A (grep)</td>
</tr>
<tr>
<td><strong>Otomatik yakalama</strong></td>
<td>12 hook (sıfır manuel çaba)</td>
<td>Manuel <code>add()</code> çağrıları</td>
<td>Ajan kendi düzenler</td>
<td>Manuel düzenleme</td>
</tr>
<tr>
<td><strong>Arama</strong></td>
<td>BM25 + Vektör + Graf (RRF füzyonu)</td>
<td>Vektör + Graf</td>
<td>Vektör (arşiv)</td>
<td>Her şeyi bağlama yükler</td>
</tr>
<tr>
<td><strong>Çoklu ajan</strong></td>
<td>MCP + REST + lease'ler + sinyaller</td>
<td>API (koordinasyon yok)</td>
<td>Yalnızca Letta runtime'ı içinde</td>
<td>Ajan başına dosya</td>
</tr>
<tr>
<td><strong>Framework bağımlılığı</strong></td>
<td>Yok (herhangi bir MCP istemcisi)</td>
<td>Yok</td>
<td>Yüksek (Letta kullanılmalı)</td>
<td>Ajan başına format</td>
</tr>
<tr>
<td><strong>Harici bağımlılıklar</strong></td>
<td>Yok (SQLite + iii-engine)</td>
<td>Qdrant / pgvector</td>
<td>Postgres + vektör DB</td>
<td>Yok</td>
</tr>
<tr>
<td><strong>Bellek yaşam döngüsü</strong></td>
<td>4 katmanlı konsolidasyon + decay + otomatik-unutma</td>
<td>Pasif çıkarım</td>
<td>Ajan-yönetimli</td>
<td>Manuel ayıklama</td>
</tr>
<tr>
<td><strong>Token verimliliği</strong></td>
<td>~1,900 token/oturum ($10/yıl)</td>
<td>Entegrasyona göre değişir</td>
<td>Çekirdek bellek bağlamda</td>
<td>240 gözlemde 22K+ token</td>
</tr>
<tr>
<td><strong>Gerçek zamanlı görüntüleyici</strong></td>
<td>Var (port 3113)</td>
<td>Bulut panel</td>
<td>Bulut panel</td>
<td>Yok</td>
</tr>
<tr>
<td><strong>Self-hosted</strong></td>
<td>Evet (varsayılan)</td>
<td>İsteğe bağlı</td>
<td>İsteğe bağlı</td>
<td>Evet</td>
</tr>
</table>

---

<h2 id="quick-start"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-quickstart.svg"><img src="../assets/tags/section-quickstart.svg" alt="Quick Start" height="32" /></picture></h2>

Uyumluluk: bu sürüm kararlı `iii-sdk` `^0.11.0` ve iii-engine v0.11.x'i hedefler.

### 30 saniyede deneyin

```bash
# Terminal 1: sunucuyu başlatın
npx @agentmemory/agentmemory

# Terminal 2: örnek veriyi yükleyin ve geri çağırmayı iş başında görün
npx @agentmemory/agentmemory demo
```

`demo`, 3 gerçekçi oturum yükler (JWT auth, N+1 sorgu düzeltmesi, hız sınırlaması) ve bunlar üzerinde anlamsal aramalar çalıştırır. "veritabanı performans optimizasyonu" araması yaptığınızda "N+1 sorgu düzeltmesi"ni bulduğunu göreceksiniz — anahtar kelime eşleştirmesi bunu yapamaz.

Belleğin canlı oluşumunu izlemek için `http://localhost:3113` adresini açın.

### Önerilen: globally kurun

`npx` sürüm bazında önbelleğe alır. Geçen hafta `npx @agentmemory/agentmemory@0.9.14`'ü çalıştırdıysanız, çıplak bir `npx @agentmemory/agentmemory` `~/.npm/_npx/`'ten en son sürümü değil, eski 0.9.14'ü servis edebilir. Bir kez kurun ve çıplak `agentmemory` komutu her yerde çalışsın:

```bash
npm install -g @agentmemory/agentmemory
# macOS/Linux sistem Node kurulumlarında EACCES hatası alırsanız şununla deneyin:
# sudo npm install -g @agentmemory/agentmemory
agentmemory                    # sunucuyu başlatın (npx şekliyle aynı)
agentmemory stop               # kapatın
agentmemory remove             # oluşturduğumuz her şeyi kaldırın
agentmemory connect claude-code   # tek bir ajanı bağlayın
agentmemory doctor             # interaktif teşhis + düzeltme istemleri
```

v0.9.16 ve sonrası ile birlikte, ilk npx çalıştırması global kurmanızı satır içi olarak ister — bir kez `Y` yanıtlayın, hazırsınız. Atlarsanız, taze bir indirme için şunlardan birine geri dönün:

```bash
npx -y @agentmemory/agentmemory@latest                 # npm'den en güncelini zorlar (platformlar arası)
rm -rf ~/.npm/_npx && npx @agentmemory/agentmemory     # yalnız macOS/Linux (POSIX shell)
```

Windows / PowerShell'de eşdeğer cache temizleme komutu `Remove-Item -Recurse -Force "$env:LOCALAPPDATA\npm-cache\_npx"` şeklindedir — yukarıdaki `npx -y ...@latest` formu platformlar arası seçenektir.

### Oturum Tekrar Oynatma (Session Replay)

agentmemory'nin kaydettiği her oturum tekrar oynatılabilir. Görüntüleyiciyi açın, **Replay** sekmesini seçin ve zaman çizelgesini tarayın: istemler, araç çağrıları, araç sonuçları ve yanıtlar; oynat/duraklat, hız kontrolü (0.5×–4×) ve klavye kısayollarıyla (boşluk geçiş, oklar adım atlama) ayrı olaylar olarak görüntülenir.

Halihazırda içeri aktarmak istediğiniz eski Claude Code JSONL kayıtlarınız mı var?

```bash
# Varsayılan ~/.claude/projects altındaki her şeyi içeri aktar
npx @agentmemory/agentmemory import-jsonl

# Veya tek bir dosya içeri aktar
npx @agentmemory/agentmemory import-jsonl ~/.claude/projects/-my-project/abc123.jsonl
```

İçeri aktarılan oturumlar yerli olanların yanında Replay seçicisinde görünür. Arka planda her giriş `mem::replay::load`, `mem::replay::sessions` ve `mem::replay::import-jsonl` iii fonksiyonları üzerinden yönlendirilir — yan kanal sunucu yok.

### Yükseltme / Bakım

Yerel runtime'ınızı bilinçli olarak güncellemek istediğinizde bakım komutunu kullanın:

```bash
npx @agentmemory/agentmemory upgrade
```

Uyarı: bu komut mevcut çalışma alanını/runtime'ı değiştirir. JavaScript bağımlılıklarını güncelleyebilir ve sabitlenmiş `iiidev/iii:0.11.2` Docker imajını çekebilir. Asla sabitlenmemiş ya da daha yeni bir iii motoru kurmaz.

Uygulama detayları `src/cli.ts` içinde (`src/cli.ts:544-595` bölgesi civarında `runUpgrade`'a bakın).

### Claude Code (tek blok, yapıştırın)

```text
Install agentmemory: run `npx @agentmemory/agentmemory` in a separate terminal to start the memory server. Then run `/plugin marketplace add rohitg00/agentmemory` and `/plugin install agentmemory` — the plugin registers all 12 hooks, 4 skills, AND auto-wires the `@agentmemory/mcp` stdio server via its `.mcp.json`, so you get 53 MCP tools (memory_smart_search, memory_save, memory_sessions, memory_governance_delete, etc.) without any extra config step. Verify with `curl http://localhost:3111/agentmemory/health`. The real-time viewer is at http://localhost:3113.
```

#### Eklenti kurulumu olmadan Claude Code (MCP-bağımsız yol)

Eğer `/plugin install` kullanmak yerine agentmemory'nin MCP sunucusunu doğrudan `~/.claude.json` üzerinden bağlarsanız, Claude Code `${CLAUDE_PLUGIN_ROOT}`'u asla çözmez ve hook scriptlerini `~/.claude/settings.json` içinde mutlak yollara işaret etmek zorunda kalırsınız. Bu yollar genellikle agentmemory sürümünü gömer (örn. `~/.codex/plugins/cache/agentmemory/agentmemory/0.9.21/scripts/…`), bu yüzden bir sonraki yükseltme her hook'u sessizce kırar.

Geçici çözüm:

```bash
agentmemory connect claude-code --with-hooks
```

Bu, aynı hook komutlarını `~/.claude/settings.json` içine, kurulu `@agentmemory/agentmemory` paketinin paketli `plugin/` dizinine çözülmüş mutlak yollarla birleştirir. agentmemory'yi yükselttikten sonra yolları yenilemek için komutu yeniden çalıştırın. Aynı dosyadaki kullanıcı girdileri korunur; yalnızca önceki agentmemory girdileri değiştirilir. `/plugin install` yolunu kullanmak hâlâ önerilen yaklaşımdır.
Uzak veya korumalı deployment'lar için Claude Code'u `AGENTMEMORY_URL` ve `AGENTMEMORY_SECRET` ayarlanmış olarak başlatın. Eklenti her iki değeri de paketli MCP sunucusuna geçirir; `AGENTMEMORY_URL` boş olduğunda MCP shim'i `http://localhost:3111`'i kullanır.

### Codex CLI (Codex eklenti platformu)

```bash
# 1. ayrı bir terminalde bellek sunucusunu başlatın
npx @agentmemory/agentmemory

# 2. agentmemory marketplace'i kaydedin ve eklentiyi kurun
codex plugin marketplace add rohitg00/agentmemory
codex plugin add agentmemory@agentmemory
```

Codex eklentisi, Claude Code eklentisiyle aynı `plugin/` dizininden gelir. Şunları kaydeder:

- `@agentmemory/mcp` MCP sunucusu olarak (`AGENTMEMORY_URL` çalışan bir agentmemory sunucusuna işaret ettiğinde tüm 51 tool'u proxy yapar; erişilebilir sunucu yoksa yerel olarak 7 tool'a düşer)
- 6 yaşam döngüsü hook'u: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `Stop`
- 4 skill: `/recall`, `/remember`, `/session-history`, `/forget`

Codex'in hook motoru, hook alt süreçlerine `CLAUDE_PLUGIN_ROOT` enjekte eder (bkz. [`codex-rs/hooks/src/engine/discovery.rs`](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/engine/discovery.rs)), bu sayede aynı hook scriptleri her iki host'ta da çoğaltma yapmadan çalışır. Subagent / SessionEnd / Notification / TaskCompleted / PostToolUseFailure olayları yalnızca Claude Code'a özeldir ve Codex için kaydedilmez.

#### Codex Desktop: eklenti hook'ları şu anda sessiz (geçici çözüm mevcut)

`CodexHooks` ve `PluginHooks` her ikisi de [`codex-rs/features/src/lib.rs`](https://github.com/openai/codex/blob/main/codex-rs/features/src/lib.rs) içinde stable + varsayılan olarak etkin, ancak Codex Desktop sürümleri şu anda eklenti-yerel `hooks.json`'u dağıtmıyor ([openai/codex#16430](https://github.com/openai/codex/issues/16430)). MCP tool'ları hâlâ çalışıyor; yalnızca yaşam döngüsü gözlemleri eksik.

Düzeltme upstream'e iner inmez, aynı hook komutlarını global `~/.codex/hooks.json` içine yansıtın:

```bash
agentmemory connect codex --with-hooks
```

Bu, `~/.codex/hooks.json`'a paketli scriptlere mutlak yollarla atıfta bulunan idempotent bir blok ekler (user-scope'ta `${CLAUDE_PLUGIN_ROOT}` genişlemesi gerekmez). agentmemory'yi yükselttikten sonra yolları yenilemek için aynı komutu yeniden çalıştırın. Aynı dosyadaki kullanıcı girdileri korunur; yalnızca önceki agentmemory girdileri değiştirilir.

<details>
<summary><b>OpenClaw (bu istemi yapıştırın)</b></summary>

```text
Install agentmemory for OpenClaw. Run `npx @agentmemory/agentmemory` in a separate terminal to start the memory server on localhost:3111. Then add this to my OpenClaw MCP config so agentmemory is available with all 51 memory tools:

{
  "mcpServers": {
    "agentmemory": {
      "command": "npx",
      "args": ["-y", "@agentmemory/mcp"],
      "env": {
        "AGENTMEMORY_URL": "http://localhost:3111"
      }
    }
  }
}

Restart OpenClaw. Verify with `curl http://localhost:3111/agentmemory/health`. Open http://localhost:3113 for the real-time viewer. For deeper memory-slot integration, copy `integrations/openclaw` to `~/.openclaw/extensions/agentmemory` and enable `plugins.slots.memory = "agentmemory"` in `~/.openclaw/openclaw.json`.
```

Tam kılavuz: [`integrations/openclaw/`](../integrations/openclaw/)

</details>

<details>
<summary><b>Hermes Agent (bu istemi yapıştırın)</b></summary>

```text
Install agentmemory for Hermes. Run `npx @agentmemory/agentmemory` in a separate terminal to start the memory server on localhost:3111. Then add this to ~/.hermes/config.yaml so Hermes can use agentmemory as an MCP server with all 51 memory tools:

mcp_servers:
  agentmemory:
    command: npx
    args: ["-y", "@agentmemory/mcp"]

memory:
  provider: agentmemory

Verify with `curl http://localhost:3111/agentmemory/health`. Open http://localhost:3113 for the real-time viewer. For deeper 6-hook memory provider integration (pre-LLM context injection, turn capture, MEMORY.md mirroring, system prompt block), copy integrations/hermes from the agentmemory repo to ~/.hermes/plugins/agentmemory.
```

Tam kılavuz: [`integrations/hermes/`](../integrations/hermes/)

</details>

### Diğer ajanlar

Bellek sunucusunu başlatın: `npx @agentmemory/agentmemory`

agentmemory girdisi, `mcpServers` şeklini kullanan her host'ta (Cursor, Claude Desktop, Cline, Roo Code, Windsurf, Gemini CLI, OpenClaw) **aynı MCP sunucu bloğudur**:

```json
"agentmemory": {
  "command": "npx",
  "args": ["-y", "@agentmemory/mcp"],
  "env": {
    "AGENTMEMORY_URL": "${AGENTMEMORY_URL}",
    "AGENTMEMORY_SECRET": "${AGENTMEMORY_SECRET}"
  }
}
```

**Bu girdiyi host'un yapılandırma dosyasındaki mevcut `mcpServers` nesnesine birleştirin** — dosyayı değiştirmeyin. Dosyada zaten başka sunucular varsa, `agentmemory`'yi `mcpServers` içindeki başka bir anahtar olarak yanlarına ekleyin. `mcpServers` tamamen eksikse, bloğu `{ "mcpServers": { ... } }` içine yapıştırın. `${VAR}` yer tutucuları, MCP-sunucu lansmanında shell'den `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET`'i miras alır — ayarsız değişkenler boş string geçirir ve shim `http://localhost:3111`'e geri döner. Bir tane bağlı girdi hem yerel hem uzak (k8s / reverse-proxy'li) dağıtımları kapsar.

| Ajan | Yapılandırma dosyası | Notlar |
|---|---|---|
| **Cursor** | `~/.cursor/mcp.json` | `mcpServers` içine birleştirin. Web sitesinde tek tıklamayla deeplink de mevcut. |
| **Claude Desktop** | `claude_desktop_config.json` (Application Support) | `mcpServers` içine birleştirin. Düzenlemeden sonra Claude Desktop'ı yeniden başlatın. |
| **Cline / Roo Code / Kilo Code** | Cline MCP ayarları (Settings UI → MCP Servers → Edit) | Aynı `mcpServers` bloğu. |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` | Aynı `mcpServers` bloğu. |
| **Gemini CLI** | `~/.gemini/settings.json` | `gemini mcp add agentmemory npx -y @agentmemory/mcp --scope user` (otomatik birleştirir). |
| **OpenClaw** | OpenClaw MCP yapılandırması | Aynı `mcpServers` bloğu veya daha derin [bellek eklentisi](../integrations/openclaw/) kullanın. |
| **Codex CLI (yalnız MCP)** | `.codex/config.toml` | TOML şekli: `codex mcp add agentmemory -- npx -y @agentmemory/mcp` veya manuel olarak `[mcp_servers.agentmemory]` ekleyin. |
| **Codex CLI (tam eklenti)** | Codex eklenti marketplace | `codex plugin marketplace add rohitg00/agentmemory` ardından `codex plugin add agentmemory@agentmemory`. MCP + 6 yaşam döngüsü hook'u (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PreCompact, Stop) + 4 skill kaydeder. Codex Desktop'ta, [openai/codex#16430](https://github.com/openai/codex/issues/16430) inene kadar `agentmemory connect codex --with-hooks` da çalıştırın — eklenti hook'ları şu anda orada sessiz. |
| **OpenCode (yalnız MCP)** | `opencode.json` | Farklı şekil — üst seviye `mcp` anahtarı, komut dizi olarak: `{"mcp": {"agentmemory": {"type": "local", "command": ["npx", "-y", "@agentmemory/mcp"], "enabled": true}}}`. |
| **OpenCode (tam eklenti)** | `plugin/opencode/` | Oturum yaşam döngüsü, mesajlar, araçlar, hataları kapsayan 22 otomatik yakalama hook'u. İki slash komut (`/recall`, `/remember`). `plugin/opencode/`'u OpenCode çalışma alanınıza kopyalayın ve eklenti girdisini `opencode.json`'a ekleyin. Tam hook tablosu + gap analizi için [`plugin/opencode/README.md`](../plugin/opencode/README.md) bakın. |
| **pi** | `~/.pi/agent/extensions/agentmemory` | [`integrations/pi`](../integrations/pi/)'yi kopyalayın ve pi'yi yeniden başlatın. |
| **Hermes Agent** | `~/.hermes/config.yaml` | Daha derin [bellek sağlayıcı eklentisi](../integrations/hermes/)'ni `memory.provider: agentmemory` ile kullanın. |
| **Qwen Code** | `~/.qwen/settings.json` | `agentmemory connect qwen` standart `mcpServers` bloğunu yazar. Hook yükü Claude Code ile alan-uyumludur, bu yüzden mevcut 12 hook scripti değişiklik yapmadan çalışır — aynı `settings.json`'daki `hooks` bölümü üzerinden bağlayın. |
| **Antigravity** (Gemini CLI'nin yerini alır) | `mcp_config.json` (Antigravity'nin User dizininde) | `agentmemory connect antigravity` standart `mcpServers` bloğunu yazar. macOS: `~/Library/Application Support/Antigravity/User/`. Linux: `~/.config/Antigravity/User/`. 2026-06-18 Gemini CLI sonlandırılması sonrasında kullanın. |
| **Kiro** | `~/.kiro/settings/mcp.json` | `agentmemory connect kiro` kullanıcı-seviyesi yapılandırmayı yazar. Çalışma alanı override'ları kodunuzun yanındaki `.kiro/settings/mcp.json`'a gider. |
| **Goose** | Goose MCP ayarları UI | Aynı `mcpServers` bloğu. |
| **Aider** | n/a | REST API ile doğrudan konuşun: `curl -X POST http://localhost:3111/agentmemory/smart-search -d '{"query": "auth"}'`. |
| **Herhangi bir ajan (32+)** | n/a | `npx skillkit install agentmemory` host'u otomatik algılar ve birleştirir. |

**Sandbox'lı MCP istemcileri** (Flatpak / Snap / kısıtlayıcı container'lar) host'un `localhost`'una erişemez: ayrıca `env` bloğunda `"AGENTMEMORY_FORCE_PROXY": "1"` ayarlayın ve `AGENTMEMORY_URL`'i sandbox'ın gerçekten erişebileceği bir rotaya yönlendirin (örn. LAN IP'niz).

### Programatik erişim (Python / Rust / Node)

agentmemory çekirdek işlemlerini iii fonksiyonları olarak kaydeder (`mem::remember`, `mem::observe`, `mem::context`, `mem::smart-search`, `mem::forget`). iii SDK'sı olan herhangi bir dil, bunları doğrudan `ws://localhost:49134` üzerinden çağırabilir — dil başına ayrı bir REST istemcisi yok.

```bash
pip install iii-sdk         # Python
cargo add iii-sdk           # Rust
npm  install iii-sdk        # Node
```

```python
from iii import register_worker

iii = register_worker("ws://localhost:49134")
iii.connect()

iii.trigger({
    "function_id": "mem::smart-search",
    "payload": {"project": "demo", "query": "how do tokens refresh"},
})
```

Çalışan örnek: [`examples/python/`](../examples/python/) (quickstart + gözlem/recall akışı). iii runtime'ı olmayan host'lar için REST `:3111` üzerinde kullanılmaya devam eder.

### Kaynaktan

```bash
git clone https://github.com/rohitg00/agentmemory.git && cd agentmemory
npm install && npm run build && npm start
```

Bu, `iii` zaten kuruluysa yerel bir `iii-engine` ile agentmemory'yi başlatır veya Docker mevcutsa Docker Compose'a düşer. REST, stream'ler ve görüntüleyici varsayılan olarak `127.0.0.1`'e bağlanır.

`iii-engine`'i manuel olarak kurun. **agentmemory şu anda `iii-engine`'i `v0.11.2`'ye sabitliyor** — `v0.11.6`, agentmemory'nin henüz refactor edilmediği yeni bir sandbox-her-şey-üzerinden-`iii worker add` modelini tanıtıyor. Refactor geldiğinde sabitleme kaldırılır. Sandbox modeline manuel olarak geçtiyseniz `AGENTMEMORY_III_VERSION=<version>` ile override edin.

- **macOS arm64:** `mkdir -p ~/.local/bin && curl -fsSL https://github.com/iii-hq/iii/releases/download/iii/v0.11.2/iii-aarch64-apple-darwin.tar.gz | tar -xz -C ~/.local/bin && chmod +x ~/.local/bin/iii`
- **macOS x64:** `aarch64-apple-darwin`'i `x86_64-apple-darwin` ile değiştirin
- **Linux x64:** `x86_64-unknown-linux-gnu` ile değiştirin
- **Linux arm64:** `aarch64-unknown-linux-gnu` ile değiştirin
- **Windows:** [iii-hq/iii releases v0.11.2](https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.11.2)'den `iii-x86_64-pc-windows-msvc.zip`'i indirin, `iii.exe`'yi çıkarın, PATH'e ekleyin

Veya Docker kullanın (paketli `docker-compose.yml` `iiidev/iii:0.11.2`'yi çeker). Tam dokümanlar: [iii.dev/docs](https://iii.dev/docs).

### Windows

agentmemory Windows 10/11'de çalışır, ancak yalnızca Node.js paketi yeterli değildir — arka planda çalışan bir süreç olarak `iii-engine` runtime'ı (ayrı yerel ikilik) da gerekir. Resmi upstream kurucu bir `sh` scripti ve bugün için PowerShell kurucusu veya scoop/winget paketi yok, bu yüzden Windows kullanıcılarının iki yolu var:

**Seçenek A — Önceden derlenmiş Windows ikiliği (önerilen):**

```powershell
# 1. Tarayıcınızda https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.11.2 açın
#    (engine v0.11.6+'nın gerektirdiği yeni sandbox modeli için
#     agentmemory refactor edilene kadar v0.11.2'ye sabitliyoruz)
# 2. iii-x86_64-pc-windows-msvc.zip indirin
#    (veya ARM makinedeyseniz iii-aarch64-pc-windows-msvc.zip)
# 3. iii.exe'yi PATH'te bir yere çıkarın veya şuraya yerleştirin:
#    %USERPROFILE%\.local\bin\iii.exe
#    (agentmemory bu konumu otomatik kontrol eder)
# 4. Doğrulayın:
iii --version
# Şunu yazmalı: 0.11.2

# 5. Ardından agentmemory'yi her zamanki gibi çalıştırın:
npx -y @agentmemory/agentmemory
```

**Seçenek B — Docker Desktop:**

```powershell
# 1. Windows için Docker Desktop kurun
# 2. Docker Desktop'ı başlatın ve engine'in çalıştığından emin olun
# 3. agentmemory'yi çalıştırın — paketli compose dosyasını otomatik başlatır:
npx -y @agentmemory/agentmemory
```

**Seçenek C — yalnızca bağımsız MCP (engine yok):** yalnızca ajanınız için MCP araçlarına ihtiyacınız varsa ve REST API'sine, görüntüleyiciye veya cron işlerine gerek yoksa engine'i tamamen atlayın:

```powershell
npx -y @agentmemory/agentmemory mcp
# veya shim paketi üzerinden:
npx -y @agentmemory/mcp
```

**Windows için teşhis:** `npx @agentmemory/agentmemory` başarısız olursa, gerçek engine stderr'ini görmek için `--verbose` ile yeniden çalıştırın. Yaygın hata türleri:

| Belirti | Düzeltme |
|---|---|
| `iii-engine process started` ardından `did not become ready within 15s` | Engine başlatma sırasında çöktü — `--verbose` ile yeniden çalıştırın, stderr'i kontrol edin |
| `Could not start iii-engine` | Ne `iii.exe` ne de Docker kurulu. Yukarıdaki Seçenek A veya B'ye bakın |
| Port çakışması | `netstat -ano \| findstr :3111` ile neyin bağlı olduğunu görün, ardından öldürün veya `--port <N>` kullanın |
| Docker kurulu olsa bile Docker fallback atlanıyor | Docker Desktop'ın gerçekten çalıştığından emin olun (sistem tepsisi simgesi) |

> Not: iii **motoru** önceden derlenmiş bir ikiliktir, bir cargo crate'i değildir — onu `cargo install` ile kurmaya çalışmayın. (iii **SDK'ları** crates.io, npm ve PyPI'de yayımlanmıştır, ancak agentmemory bunlara ihtiyaç duymaz.) Desteklenen motor kurulum yöntemleri, hepsi v0.11.2'ye sabitlenmiştir: yukarıdaki önceden derlenmiş v0.11.2 ikiliği, sürüm sabitlemesi **ile** upstream `sh` kurulum scripti `curl -fsSL https://install.iii.dev/iii/main/install.sh | VERSION=0.11.2 sh` (macOS/Linux) ve Docker imajı `iiidev/iii:0.11.2`. Yalın bir `install.sh | sh`, agentmemory'nin desteklemediği **en son** motoru kurar — her zaman `VERSION=0.11.2` geçirin. Hepsinden kolayı: sadece `npx @agentmemory/agentmemory` çalıştırın; bu, sabitlenmiş motoru sizin için `~/.agentmemory/bin` dizinine indirir.

---

<h2 id="deploy">Deploy</h2>

Yönetilen host'lar için tek tıklamayla şablonlar. Her biri,
npm'den `@agentmemory/agentmemory`'yi çeken ve iii engine
ikilisini resmi `iiidev/iii` Docker Hub imajından kopyalayan
kendi kendine yeten bir Dockerfile içerir — önceden derlenmiş
bir agentmemory imajı gerekmez. Kalıcı depolama `/data`'ya
bağlanır; ilk açılış entrypoint'i, npm-paketli iii yapılandırmasını
(ki `127.0.0.1`'e bağlanır) `0.0.0.0`'a bağlanan ve mutlak
`/data` yollarını kullanan deploy-ayarlı bir tanesiyle üzerine
yazar, HMAC secret'ını üretir, ardından agentmemory CLI'sini
exec etmeden önce `gosu` aracılığıyla yetkileri `root`'tan
`node`'a düşürür.

<p>
  <a href="https://fly.io/launch?repo=https://github.com/rohitg00/agentmemory&path=deploy/fly"><img src="https://img.shields.io/badge/Deploy%20to-fly.io-8b5cf6?style=for-the-badge&logo=fly.io&logoColor=white" alt="Deploy to fly.io" /></a>
  <a href="https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Frohitg00%2Fagentmemory&rootDirectory=deploy%2Frailway"><img src="https://img.shields.io/badge/Deploy%20to-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" alt="Deploy to Railway" /></a>
</p>

Render'ın tek-tıklamayla deploy düğmesi, depo kökünde `render.yaml`
gerektirir; biz bunu bilerek temiz tutuyoruz. Deponun içindeki blueprint'e
manuel olarak işaret etmek için [`deploy/render/`](../deploy/render/README.md) içinde belgelenen Render Blueprint akışını kullanın.

Tam kurulum detayları (HMAC yakalama, görüntüleyici SSH tüneli,
döndürme, yedekleme, maliyet alt sınırları) [`deploy/`](../deploy/README.md) içinde:

- [`deploy/fly`](../deploy/fly/README.md) — `auto_stop_machines = "stop"` ile
  tek makine; en ucuz boşta çalışma.
- [`deploy/railway`](../deploy/railway/README.md) — Hobby planı sabit ücret,
  panelden volume.
- [`deploy/render`](../deploy/render/README.md) — Blueprint akışı,
  ücretli planlarda otomatik disk snapshot'ları.
- [`deploy/coolify`](../deploy/coolify/README.md) — kendi VPS'inizde
  [Coolify](https://coolify.io/self-hosted) üzerinden self-hosted; aynı
  Docker Compose stack'i, host ve verinin sahibi sizsiniz.

Yalnızca `3111` portu yayımlanır. `3113`'teki görüntüleyici container içinde
loopback'e bağlı kalır — her şablonun README'si ona ulaşmak için SSH-tünel
desenini belgeler.

---

<h2 id="why-agentmemory"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-why.svg"><img src="../assets/tags/section-why.svg" alt="Why agentmemory" height="32" /></picture></h2>

Her kodlama ajanı, oturum sona erdiğinde her şeyi unutur. Her oturumun ilk 5 dakikasını yığınınızı yeniden anlatarak harcarsınız. agentmemory arka planda çalışır ve bunu tamamen ortadan kaldırır.

```text
Session 1: "Add auth to the API"
  Agent writes code, runs tests, fixes bugs
  agentmemory silently captures every tool use
  Session ends -> observations compressed into structured memory

Session 2: "Now add rate limiting"
  Agent already knows:
    - Auth uses JWT middleware in src/middleware/auth.ts
    - Tests in test/auth.test.ts cover token validation
    - You chose jose over jsonwebtoken for Edge compatibility
  Zero re-explaining. Starts working immediately.
```

### Yerleşik ajan belleğiyle karşılaştırma

Her AI kodlama ajanı yerleşik bellekle gelir — Claude Code'da `MEMORY.md`, Cursor'da notepad, Cline'da memory bank var. Bunlar yapışkan notlar gibi çalışır. agentmemory, o yapışkan notların ardındaki aranabilir veritabanıdır.

| | Yerleşik (CLAUDE.md) | agentmemory |
|---|---|---|
| Ölçek | 200 satır sınırı | Sınırsız |
| Arama | Her şeyi bağlama yükler | BM25 + vektör + graf (yalnız top-K) |
| Token maliyeti | 240 gözlemde 22K+ | ~1,900 token (%92 daha az) |
| Ajanlar arası | Ajan başına dosya | MCP + REST (herhangi bir ajan) |
| Koordinasyon | Yok | Lease'ler, sinyaller, action'lar, routine'ler |
| Gözlemlenebilirlik | Dosyaları manuel okuma | :3113'te gerçek zamanlı görüntüleyici |

---

<h2 id="how-it-works"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-how.svg"><img src="../assets/tags/section-how.svg" alt="How It Works" height="32" /></picture></h2>

### Bellek Pipeline'ı

```text
PostToolUse hook fires
  -> SHA-256 dedup (5min window)
  -> Privacy filter (strip secrets, API keys)
  -> Store raw observation
  -> LLM compress -> structured facts + concepts + narrative
  -> Vector embedding (6 providers + local)
  -> Index in BM25 + vector

Stop / SessionEnd hook fires
  -> Summarize session
  -> Knowledge graph extraction (if GRAPH_EXTRACTION_ENABLED=true)
  -> Slot reflection (if SLOT_REFLECT_ENABLED=true)

SessionStart hook fires
  -> Load project profile (top concepts, files, patterns)
  -> Hybrid search (BM25 + vector + graph)
  -> Token budget (default: 2000 tokens)
  -> Inject into conversation
```

### 4 Katmanlı Bellek Konsolidasyonu

İnsan beyninin belleği nasıl işlediğinden ilham aldı — uyku konsolidasyonundan çok da farklı değil.

| Katman | Ne | Analoji |
|------|------|---------|
| **Working** | Araç kullanımından ham gözlemler | Kısa süreli bellek |
| **Episodic** | Sıkıştırılmış oturum özetleri | "Ne oldu" |
| **Semantic** | Çıkarılmış olgular ve desenler | "Ne biliyorum" |
| **Procedural** | İş akışları ve karar desenleri | "Nasıl yapılır" |

Bellekler zamanla decay olur (Ebbinghaus eğrisi). Sık erişilen bellekler güçlenir. Bayat bellekler otomatik tahliye edilir. Çelişkiler algılanır ve çözülür.

### Ne Yakalanır

| Hook | Yakalar |
|------|----------|
| `SessionStart` | Proje yolu, oturum ID |
| `UserPromptSubmit` | Kullanıcı istemleri (gizlilik-filtrelenmiş) |
| `PreToolUse` | Dosya erişim desenleri + zenginleştirilmiş bağlam |
| `PostToolUse` | Tool adı, girdi, çıktı |
| `PostToolUseFailure` | Hata bağlamı |
| `PreCompact` | Sıkıştırmadan önce belleği yeniden enjekte eder |
| `SubagentStart/Stop` | Alt-ajan yaşam döngüsü |
| `Stop` | Oturum sonu özeti |
| `SessionEnd` | Oturum tamamlandı işareti |

### Temel Yetenekler

| Yetenek | Açıklama |
|---|---|
| **Otomatik yakalama** | Her tool kullanımı hook'lar üzerinden kaydedilir — sıfır manuel çaba |
| **Anlamsal arama** | RRF füzyonu ile BM25 + vektör + bilgi grafı |
| **Bellek evrimi** | Sürümleme, supersede, ilişki grafları |
| **Otomatik unutma** | TTL süresi dolması, çelişki algılama, önem tahliyesi |
| **Gizlilik öncelikli** | API anahtarları, secret'lar, `<private>` etiketleri depolamadan önce çıkarılır |
| **Kendini iyileştirme** | Devre kesici, sağlayıcı yedek zinciri, sağlık izleme |
| **Claude bridge** | MEMORY.md ile çift yönlü sync |
| **Bilgi grafı** | Entity çıkarımı + BFS gezinti |
| **Takım belleği** | İsimlendirilmiş paylaşımlı + özel takım üyeleri arasında |
| **Atıf provenansı** | Herhangi bir belleği kaynak gözlemlere kadar izleyin |
| **Git snapshot'ları** | Bellek durumunu sürümleyin, geri alın ve diff'leyin |

---

<h2 id="search"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-search.svg"><img src="../assets/tags/section-search.svg" alt="Search" height="32" /></picture></h2>

Üç sinyali birleştiren üçlü-akış geri getirme:

| Akış | Ne yapar | Ne zaman |
|---|---|---|
| **BM25** | Eş anlamlı genişletmeli stem'lenmiş anahtar kelime eşleştirme | Her zaman açık |
| **Vektör** | Yoğun embedding'ler üzerinde kosinüs benzerliği | Embedding sağlayıcı yapılandırılmış |
| **Graf** | Entity eşleştirme yoluyla bilgi grafı gezintisi | Sorguda entity'ler tespit edildiğinde |

Reciprocal Rank Fusion (RRF, k=60) ile birleştirilir ve oturum-çeşitlendirilir (oturum başına maksimum 3 sonuç).

BM25, Yunanca, Kiril, İbranice, Arapça ve aksanlı Latin'i kutudan çıkar çıkmaz tokenize eder. Çince / Japonca / Korece bellekler için, CJK akışlarını kelime-seviyesinde token'lara bölmek üzere isteğe bağlı segmenter'ları kurun (`npm install @node-rs/jieba tiny-segmenter`); bunlar olmadan agentmemory yumuşak olarak tüm-akış tokenizasyonuna düşer ve stderr'e bir kerelik bir ipucu yazdırır.

### Embedding sağlayıcıları

agentmemory sağlayıcınızı otomatik algılar. En iyi sonuçlar için yerel embedding'leri kurun (ücretsiz):

```bash
npm install @xenova/transformers
```

| Sağlayıcı | Model | Maliyet | Notlar |
|---|---|---|---|
| **Yerel (önerilen)** | `all-MiniLM-L6-v2` | Ücretsiz | Çevrim dışı, BM25-only üzerinde +8pp recall |
| Gemini | `gemini-embedding-001` | Ücretsiz katman | 100+ dil, 768/1536/3072 boyut (MRL), 2048-token girdi. `text-embedding-004`'ün yerini alır ([deprecated, 14 Ocak 2026'da kapanış](https://ai.google.dev/gemini-api/docs/deprecations)) |
| OpenAI | `text-embedding-3-small` | 1M başı $0.02 | En yüksek kalite |
| Voyage AI | `voyage-code-3` | Ücretli | Kod için optimize edilmiş |
| Cohere | `embed-english-v3.0` | Ücretsiz deneme | Genel amaçlı |
| OpenRouter | Herhangi bir model | Değişken | Çok-modelli proxy |

---

<h2 id="mcp-server"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-mcp.svg"><img src="../assets/tags/section-mcp.svg" alt="MCP Server" height="32" /></picture></h2>

53 tool, 6 kaynak, 3 prompt ve 4 skill — herhangi bir ajan için en kapsamlı MCP bellek toolkit'i.

> **MCP shim vs tam sunucu:** yayımlanan `@agentmemory/mcp` paketi ince bir shim'dir. Tam 51-tool yüzeyini **yalnızca `AGENTMEMORY_URL` üzerinden çalışan bir agentmemory sunucusuna erişebildiğinde** açığa çıkarır (proxy modu). Erişilebilir sunucu yoksa, shim 7-tool yerel sete (`memory_save`, `memory_recall`, `memory_smart_search`, `memory_sessions`, `memory_export`, `memory_audit`, `memory_governance_delete`) düşer. `AGENTMEMORY_TOOLS=core|all` env değişkeni *sunucu tarafı* bir bayraktır — shim'in `env` bloğunda ayarlamak hiçbir etki yapmaz. Cursor / OpenCode / Gemini CLI'da yalnızca 7 tool görüyorsanız, `npx @agentmemory/agentmemory` (veya Docker stack'i) başlatın ve `AGENTMEMORY_URL=http://localhost:3111` ayarlayın.

### 51 Tool

<details>
<summary>Çekirdek tool'lar (her zaman kullanılabilir)</summary>

| Tool | Açıklama |
|------|-------------|
| `memory_recall` | Geçmiş gözlemleri ara |
| `memory_compress_file` | Yapıyı koruyarak markdown dosyalarını sıkıştır |
| `memory_save` | Bir içgörü, karar veya deseni kaydet |
| `memory_patterns` | Tekrar eden desenleri algıla |
| `memory_smart_search` | Hibrit anlamsal + anahtar kelime araması |
| `memory_file_history` | Belirli dosyalar hakkında geçmiş gözlemler |
| `memory_sessions` | Son oturumları listele |
| `memory_timeline` | Kronolojik gözlemler |
| `memory_profile` | Proje profili (kavramlar, dosyalar, desenler) |
| `memory_export` | Tüm bellek verisini dışa aktar |
| `memory_relations` | İlişki grafını sorgula |

</details>

<details>
<summary>Genişletilmiş tool'lar (51 toplam — AGENTMEMORY_TOOLS=all ayarla)</summary>

| Tool | Açıklama |
|------|-------------|
| `memory_patterns` | Tekrar eden desenleri algıla |
| `memory_timeline` | Kronolojik gözlemler |
| `memory_relations` | İlişki grafını sorgula |
| `memory_graph_query` | Bilgi grafı gezintisi |
| `memory_consolidate` | 4 katmanlı konsolidasyonu çalıştır |
| `memory_claude_bridge_sync` | MEMORY.md ile sync |
| `memory_team_share` | Takım üyeleriyle paylaş |
| `memory_team_feed` | Son paylaşılan öğeler |
| `memory_audit` | İşlemlerin denetim izi |
| `memory_governance_delete` | Denetim izi ile sil |
| `memory_snapshot_create` | Git-sürümlü snapshot |
| `memory_action_create` | Bağımlılıklarla iş öğesi oluştur |
| `memory_action_update` | Action durumunu güncelle |
| `memory_frontier` | Önceliğe göre sıralanmış engellenmemiş action'lar |
| `memory_next` | Tek en önemli sonraki action |
| `memory_lease` | Exclusive action lease'leri (çoklu ajan) |
| `memory_routine_run` | İş akışı routine'lerini örnekle |
| `memory_signal_send` | Ajanlar arası mesajlaşma |
| `memory_signal_read` | Onay alındıyla mesajları oku |
| `memory_checkpoint` | Harici koşul kapıları |
| `memory_mesh_sync` | Örnekler arasında P2P sync |
| `memory_sentinel_create` | Event-driven gözcüler |
| `memory_sentinel_trigger` | Sentinel'leri harici olarak tetikle |
| `memory_sketch_create` | Ephemeral action grafları |
| `memory_sketch_promote` | Kalıcıya yükselt |
| `memory_crystallize` | Action zincirlerini kompakt et |
| `memory_diagnose` | Sağlık kontrolleri |
| `memory_heal` | Sıkışmış durumu otomatik düzelt |
| `memory_facet_tag` | Boyut:değer etiketleri |
| `memory_facet_query` | Facet etiketlerine göre sorgula |
| `memory_verify` | Provenansı izle |

</details>

### 6 Kaynak · 3 Prompt · 4 Skill

| Tür | İsim | Açıklama |
|------|------|-------------|
| Resource | `agentmemory://status` | Sağlık, oturum sayısı, bellek sayısı |
| Resource | `agentmemory://project/{name}/profile` | Proje başına zeka |
| Resource | `agentmemory://memories/latest` | En son 10 aktif bellek |
| Resource | `agentmemory://graph/stats` | Bilgi grafı istatistikleri |
| Prompt | `recall_context` | Ara + bağlam mesajları döndür |
| Prompt | `session_handoff` | Ajanlar arasında handoff verisi |
| Prompt | `detect_patterns` | Tekrar eden desenleri analiz et |
| Skill | `/recall` | Belleği ara |
| Skill | `/remember` | Uzun süreli belleğe kaydet |
| Skill | `/session-history` | Son oturum özetleri |
| Skill | `/forget` | Gözlemleri/oturumları sil |

### Bağımsız MCP

Tam sunucu olmadan çalıştır — herhangi bir MCP istemcisi için. Şunlardan herhangi biri çalışır:

```bash
npx -y @agentmemory/agentmemory mcp   # kanonik (her zaman kullanılabilir)
npx -y @agentmemory/mcp                # shim paketi takma adı
```

Veya ajanınızın MCP yapılandırmasına ekleyin:

Çoğu ajan (Cursor, Claude Desktop, Cline, Roo Code, Windsurf, Gemini CLI):
```json
{
  "mcpServers": {
    "agentmemory": {
      "command": "npx",
      "args": ["-y", "@agentmemory/mcp"],
      "env": {
        "AGENTMEMORY_URL": "http://localhost:3111"
      }
    }
  }
}
```

`agentmemory` girdisini, dosyayı değiştirmek yerine host'unuzun mevcut `mcpServers` nesnesine birleştirin. Host'un `localhost`'una erişemeyen sandbox'lı istemciler için env bloğuna `"AGENTMEMORY_FORCE_PROXY": "1"` ekleyin ve `AGENTMEMORY_URL`'i sandbox'ın erişebileceği bir rotaya ayarlayın.

OpenCode (`opencode.json`):
```json
{
  "mcp": {
    "agentmemory": {
      "type": "local",
      "command": ["npx", "-y", "@agentmemory/mcp"],
      "enabled": true
    }
  },
  "plugin": ["./plugins/agentmemory-capture.ts"]
}
```

Eklenti dosyasını depodan kopyalayın:
```bash
mkdir -p ~/.config/opencode/plugins
cp plugin/opencode/agentmemory-capture.ts ~/.config/opencode/plugins/
cp plugin/opencode/commands/*.md ~/.config/opencode/commands/
```

---

<h2 id="real-time-viewer"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="Real-Time Viewer" height="32" /></picture></h2>

`3113` portunda otomatik başlar. Canlı gözlem akışı, oturum gezgini, bellek tarayıcısı, bilgi grafı görselleştirmesi ve sağlık paneli.

```bash
open http://localhost:3113
```

Görüntüleyici sunucusu varsayılan olarak `127.0.0.1`'e bağlanır. REST-servisli `/agentmemory/viewer` endpoint'i normal `AGENTMEMORY_SECRET` bearer-token kurallarını izler. CSP başlıkları yanıt başına bir script nonce'ı kullanır ve satır içi handler özniteliklerini devre dışı bırakır (`script-src-attr 'none'`).

---

<h2 id="iii-console"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="iii Console" height="32" /></picture></h2>

`:3113`'teki görüntüleyici ajanınızın **hatırladıklarını** gösterir. [iii konsolu](https://iii.dev/docs/console) ajanınızın **yaptıklarını** gösterir — her bellek op'u bir OpenTelemetry trace'i olarak, her KV girdisi düzenlenebilir, her fonksiyon çağrılabilir, her stream dinlenebilir. Aynı belleğe iki pencere: biri ürün-şekilli, diğeri motor-şekilli.

Bir `memory_smart_search`'ün ateşlenmesini izleyin ve BM25 taramasını → embedding aramasını → RRF füzyonunu → reranker'ı bir şelale olarak görün. Sıkışmış bir konsolidasyon zamanlayıcısını KV tarayıcıda düzenleyin. `PostToolUse` hook'unu değiştirilmiş bir payload ile tekrar oynatın. WebSocket stream'ini sabitleyin ve gözlemlerin canlı olarak indiğini izleyin.

agentmemory bunu ücretsiz dağıtır çünkü her fonksiyon, trigger, durum kapsamı ve stream bir iii primitif'idir — özel hiçbir şey, enstrümante edilecek hiçbir şey yok.

<p align="center">
  <img src="../assets/iii-console/workers.png" alt="iii console Workers page — connected workers including agentmemory instances with live function counts and runtime metadata" width="720" />
  <br/>
  <em>Workers sayfası: bağlı her worker — agentmemory'nin kendisi dahil — PID, fonksiyon sayısı, runtime ve son-görülme ile birlikte.</em>
</p>

**Zaten kurulu.** Konsol `iii` ile birlikte gelir — ayrı kurucu yok.

**agentmemory ile birlikte başlat:**

```bash
# agentmemory görüntüleyicisi 3113 portunu tutar, bu yüzden konsolu 3114'te çalıştırın.
# Engine REST (3111), WebSocket (3112) ve bridge (49134) varsayılanları agentmemory ile eşleşir.
iii console --port 3114
```

Ardından `http://localhost:3114`'ü açın. Deneysel mimari-grafı sayfası için `--enable-flow` ekleyin.

Yalnızca taşıdıysanız engine endpoint'lerini override edin:

```bash
iii console --port 3114 \
  --engine-port 3111 \
  --ws-port 3112 \
  --bridge-port 49134
```

**Konsoldan neler yapabilirsiniz:**

| Sayfa | Şunun için kullanın |
|------|-----------|
| **Workers** | Bağlı her worker'ı ve canlı metriklerini görün — agentmemory worker'ının kendisi dahil. |
| **Functions** | agentmemory'nin herhangi bir fonksiyonunu doğrudan JSON payload ile çağırın — bir istemci bağlamadan `memory.recall`, `memory.consolidate`, `graph.query` test etmek için kullanışlı. |
| **Triggers** | HTTP, cron, event ve state trigger'larını tekrar oynatın — konsolidasyon cron'unu manuel olarak ateşleyin, bir HTTP route'unu yeniden deneyin, bir durum değişikliği yayın. |
| **States** | Tam CRUD ile KV tarayıcı — oturumlar, bellek slot'ları, yaşam döngüsü zamanlayıcıları, embedding'ler indeksi — değerleri yerinde düzenleyin. |
| **Streams** | Bellek yazımları, hook olayları ve gözlem güncellemeleri için iii stream'leri üzerinden akarken canlı WebSocket monitörü. |
| **Queues** | Dayanıklı kuyruk konuları + dead-letter yönetimi. Başarısız embedding / sıkıştırma işlerini tekrar oynatın veya bırakın. |
| **Traces** | OpenTelemetry şelale / alev / hizmet-dağılımı görünümleri. `trace_id` ile filtreleyerek tek bir `memory.search`'ün hangi fonksiyonları, DB çağrılarını ve embedding isteklerini ürettiğini tam olarak görün. |
| **Logs** | Trace/span ID'lerine korelasyonlu, yapılandırılmış OTEL logları. |
| **Config** | Runtime yapılandırması — engine'inizin hangi worker'lar, sağlayıcılar ve portlarla çalıştığını tam olarak görün. |
| **Flow** | (İsteğe bağlı, `--enable-flow`) Her worker, trigger ve stream'in interaktif mimari grafı. |

<p align="center">
  <img src="../assets/iii-console/traces-waterfall.png" alt="iii console trace waterfall view showing per-span duration" width="720" />
  <br/>
  <em>Traces: her bellek işlemi için şelale / alev / hizmet dağılımı.</em>
</p>

**Trace'ler zaten açık:**

`iii-config.yaml` `iii-observability` worker'ı etkinleştirilmiş olarak gelir (`exporter: memory`, `sampling_ratio: 1.0`, metrikler + log'lar). Ekstra yapılandırma gerekmez — agentmemory başlar başlamaz, her bellek işlemi konsolun okuyabileceği bir trace span'ı ve yapılandırılmış bir log yayar.

Bunun yerine Jaeger/Honeycomb/Grafana Tempo'ya dışa aktarmak isterseniz, `exporter: memory`'yi `exporter: otlp` olarak değiştirin ve collector endpoint'ini iii'nin observability dokümanlarına göre ayarlayın.

> **Dikkat:** konsolun kendisinde hiçbir auth zorlanmaz — `127.0.0.1`'e bağlı tutun (varsayılan) ve asla genel kullanıma açmayın.

---

<h2 id="powered-by-iii"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-architecture.svg"><img src="../assets/tags/section-architecture.svg" alt="Powered by iii" height="32" /></picture></h2>

agentmemory **zaten çalışan bir [iii](https://iii.dev) örneğidir**. Fonksiyonlar, trigger'lar, KV state, stream'ler, OTEL trace'leri — hepsi iii primitifleridir. Postgres, Redis, Express, pm2 veya Prometheus kurmadınız çünkü iii bunların yerini alıyor.

Bu da, tek bir komutun agentmemory'yi tamamen yeni bir yetenekle genişlettiği anlamına gelir.

### agentmemory'yi tek komutla genişletin

```bash
iii worker add iii-pubsub          # bellek yazımlarını bağlı her örneğe fan-out et
iii worker add iii-cron            # zamanlanmış konsolidasyon, decay süpürmeleri, snapshot rotasyonu
iii worker add iii-queue           # embedding + sıkıştırma işleri için dayanıklı yeniden denemeler
iii worker add iii-observability   # her bellek op'unda OTEL trace'leri (varsayılan açık)
iii worker add iii-sandbox         # hatırlanan kodu izole bir microVM içinde çalıştır
iii worker add iii-database        # SQL destekli bir state adaptörü tak
iii worker add mcp                 # agentmemory MCP'sinin yanında genel MCP host'u
```

Her `iii worker add` agentmemory'nin zaten çalıştığı aynı engine'e yeni fonksiyonlar ve trigger'lar kaydeder. Görüntüleyici ve konsol bunları anında alır — yeniden yükleme yok, yeni entegrasyon yok, yeni container yok.

| `iii worker add` | agentmemory'nin üzerine ne elde edersiniz |
|---|---|
| [`iii-pubsub`](https://workers.iii.dev/workers/iii-pubsub) | Çoklu-örnek bellek: her `remember` fan-out olur, her `search` birleşimi okur |
| [`iii-cron`](https://workers.iii.dev/workers/iii-cron) | Zamanlanmış yaşam döngüsü — geceleri konsolidasyon, haftalık snapshot'lar, sabit bir saatte decay |
| [`iii-queue`](https://workers.iii.dev/workers/iii-queue) | Dayanıklı yeniden denemeler: başarısız embedding + sıkıştırma işleri yeniden başlatmaya dayanır, kayıp gözlem yok |
| [`iii-observability`](https://workers.iii.dev/workers/iii-observability) | OTEL trace'leri, metrikleri, log'ları her fonksiyonda — birinci günden itibaren `iii-config.yaml`'da bağlı |
| [`iii-sandbox`](https://workers.iii.dev/workers/iii-sandbox) | `memory_recall`'dan çıkan kod, shell'inizde değil, bir kullan-at VM içinde çalışır |
| [`iii-database`](https://workers.iii.dev/workers/iii-database) | In-memory KV varsayılanlarını aştığınızda SQL destekli state adaptörü |
| [`mcp`](https://workers.iii.dev/workers/mcp) | agentmemory'ninin yanında ekstra MCP sunucuları ayağa kaldırın, aynı engine'i paylaşın |

Tam kayıt defteri: [workers.iii.dev](https://workers.iii.dev). Oradaki her worker, agentmemory'nin kullandığı aynı primitifler aracılığıyla bir araya gelir — ve elinizde olan agentmemory de onlardan biridir.

### iii'nin yerini aldığı şeyler

| Geleneksel stack | agentmemory kullanır |
|---|---|
| Express.js / Fastify | iii HTTP Triggers |
| SQLite / Postgres + pgvector | iii KV State + in-memory vektör indeksi |
| SSE / Socket.io | iii Streams (WebSocket) |
| pm2 / systemd | iii engine worker süpervizyonu |
| Prometheus / Grafana | iii OTEL + sağlık monitörü |
| Özel eklenti sistemleri | `iii worker add <name>` |

**118 kaynak dosya · ~21,800 LOC · 950+ test · 123 fonksiyon · 34 KV scope** — hepsi üç primitif üzerinde. `agentmemory plugin install` yok. Eklenti sistemi iii'nin kendisi.

---

<h2 id="configuration"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-config.svg"><img src="../assets/tags/section-config.svg" alt="Configuration" height="32" /></picture></h2>

### LLM Sağlayıcıları

agentmemory ortamınızdan otomatik algılar. Varsayılan olarak, bir sağlayıcı yapılandırmadıkça veya Claude abonelik fallback'ine açıkça opt-in yapmadıkça hiçbir LLM çağrısı yapılmaz.

| Sağlayıcı | Yapılandırma | Notlar |
|----------|--------|-------|
| **No-op (varsayılan)** | Yapılandırma gerekmez | LLM destekli compress/summarize DEVRE DIŞI. Sentetik BM25 sıkıştırma + recall hâlâ çalışır. Eskiden Claude-abonelik fallback'ine dayanıyorsanız aşağıdaki `AGENTMEMORY_ALLOW_AGENT_SDK`'ya bakın. |
| Anthropic API | `ANTHROPIC_API_KEY` | Token başına faturalama |
| MiniMax | `MINIMAX_API_KEY` | Anthropic-uyumlu |
| Gemini | `GEMINI_API_KEY` | Embedding'leri de etkinleştirir |
| OpenRouter | `OPENROUTER_API_KEY` | Herhangi bir model |
| Claude abonelik fallback'i | `AGENTMEMORY_ALLOW_AGENT_SDK=true` | Yalnızca opt-in. `@anthropic-ai/claude-agent-sdk` oturumları doğurur — eskiden sınırsız Stop-hook recursion'ına neden oluyordu, bu yüzden artık varsayılan değil. |

### Maliyet bilincine sahip model seçimi

Arka plan sıkıştırması her gözlemde çalışır, bu yüzden model seçimi aylık harcamayı anlamlı ölçüde değiştirir. Yakalanan iş yükü verisi: 635 istek / 888K token / 35 saatlik aktif kullanım, 2026-05-23 fiyatlandırmasında üç OpenRouter modeline karşı çalıştırıldı.

| Katman | Model | Girdi / 1M | Çıktı / 1M | Yakalanan 35 saat maliyeti | Notlar |
|------|-------|------------|-------------|---------------------------|-------|
| Önerilen | `deepseek/deepseek-v4-pro` | $0.435 | $0.87 | ~$0.46 | Sonnet'ten ~10× daha düşük maliyetle sağlam sıkıştırma + özetleme kalitesi. |
| Önerilen | `deepseek/deepseek-chat` | $0.27 | $1.10 | ~$0.40 | Daha eski ama yalnızca-sıkıştırma iş yükleri için hâlâ iyi. |
| Önerilen | `qwen/qwen3-coder` | $0.45 | $1.80 | ~$0.55 | Oturumlarınız yoğun olarak kod-şekilli ise güçlü kod muhakemesi. |
| Premium | `anthropic/claude-sonnet-4.6` | $3.00 | $15.00 | ~$5.02 | Yüksek kalite ancak her zaman açık arka plan çalışması için pahalı. |
| Premium | `openai/gpt-4o` | $2.50 | $10.00 | ~$4.20 | Sonnet ile benzer katman. |
| Kaçının | `anthropic/claude-opus-4.6` | $15.00 | $75.00 | ~$25+ | Reasoning sınıfı model; sıkıştırma için büyük aşırı harcama. |

`OPENROUTER_MODEL` premium-katman bir desenle eşleştiğinde agentmemory bir runtime uyarısı yazdırır. Bilinçli bir seçim yaptıktan sonra susturmak için `AGENTMEMORY_SUPPRESS_COST_WARNING=1` ayarlayın.

Bellek işi için kalite vs maliyet ödünleşmesi: sıkıştırma görece gevşek kalite çıtaları olan bir özetleme görevidir (özeti tekrar okuyan kullanıcı değil, ajandır). DeepSeek-V4-Pro / Qwen3-Coder bu görevde Sonnet'in yuvarlama hatası içinde kalırken ~10× daha az maliyetlidir. Premium katman modelleri doğrudan okuduğunuz sorgular için saklayın.

Kaynaklar: [Sonnet 4.6 için OpenRouter fiyatlandırması](https://openrouter.ai/anthropic/claude-sonnet-4.6/pricing), [DeepSeek V4 Pro](https://openrouter.ai/deepseek/deepseek-v4-pro), [DeepSeek fiyatlandırma notları](https://api-docs.deepseek.com/quick_start/pricing/).

### Çoklu-ajan belleği (`AGENT_ID` + `AGENTMEMORY_AGENT_SCOPE`)

Birden fazla rolün tek bir agentmemory sunucusunu paylaştığı çoklu-ajan kurulumlarında (architect / developer / reviewer / researcher / support-agent), `AGENT_ID` her yazıyı onu yapan rolle etiketler. `AGENTMEMORY_AGENT_SCOPE` recall'un bu etikete göre filtreleyip filtrelemeyeceğini kontrol eder.

```env
TEAM_ID=company
USER_ID=engineering-team
AGENT_ID=architect
AGENTMEMORY_AGENT_SCOPE=isolated  # isteğe bağlı; varsayılan "shared"
```

İki mod:

| Mod | Yazıları etiketle | Recall'u filtrele | Ne zaman kullanılır |
|------|------------|---------------|-------------|
| `shared` (varsayılan) | evet | hayır | Denetim iziyle ajanlar arası bağlam. Architect, developer'ın notlarını görebilir ancak her satır kim söylediğini kaydeder. |
| `isolated` | evet | evet | Katı ayrım. Architect developer'ın gözlemlerini / belleklerini / oturumlarını asla görmez. |

`AGENT_ID` ayarlandığında ne etiketlenir: `Session.agentId`, `RawObservation.agentId`, `CompressedObservation.agentId`, `Memory.agentId`. Rol `api::session::start` → `mem::observe` → `mem::compress` → KV boyunca akar.

İzole modda ne filtrelenir: `mem::smart-search`, `/agentmemory/memories`, `/agentmemory/observations`, `/agentmemory/sessions`. Her endpoint istek başına override için `?agentId=<role>` ve env kapsamından opt-out etmek için `?agentId=*` kabul eder. `/memories` ayrıca `agentId`'si undefined olan AGENT_ID öncesi belleklerin yüzeylenmesi için `?includeOrphans=true` kabul eder.

SDK / REST katmanında çağrı başına override: her mutasyon endpoint'i (`/session/start`, `/remember`) istek gövdesinde env'i geçen bir `agentId` alanı kabul eder. Tek bir sunucu sürecinden birçok rolü yönlendiren runtime'lar için kullanışlıdır.

`AGENT_ID` ayarlanmadığında bellek kapsam dışı kalır (eski davranış, etiket yok, filtre yok).

### Portlar

agentmemory + iii-engine varsayılan olarak dört port'a bağlanır. Bir yeniden başlatma `port in use` ile başarısız olursa, bu tablo hangi süreci aramanız gerektiğini söyler.

| Port | Süreç | Amaç | Env override |
|------|---------|---------|--------------|
| `3111` | agentmemory | REST API + MCP HTTP + `/agentmemory/health` + `/agentmemory/livez` | `III_REST_PORT` |
| `3112` | iii-engine | Dahili stream'ler worker'ı (agentmemory + görüntüleyici tarafından tüketilir) | `III_STREAMS_PORT` |
| `3113` | agentmemory | Gerçek zamanlı görüntüleyici (`http://localhost:3113`) | `AGENTMEMORY_VIEWER_PORT` |
| `49134` | iii-engine | WebSocket — worker'lar burada kaydolur, OTel telemetri buradan akar | `III_ENGINE_URL` (tam URL, varsayılan `ws://localhost:49134`) |

Çöken bir çalıştırma sonrası portlar bağlı kaldığında bayat-süreç temizliği:

```bash
# macOS / Linux — her portta ne varsa bulun ve öldürün
lsof -i :3111,3112,3113,49134
pkill -f agentmemory || true
pkill -f 'iii ' || true

# Windows
netstat -ano | findstr ":3111 :3112 :3113 :49134"
taskkill /F /PID <pid>
```

`agentmemory stop` graceful shutdown'da hem worker hem de engine pidfile'ını temiz olarak biçer. Yukarıdaki manuel temizlik yalnızca her iki pidfile'ın da geride kalmadığı çökme sonrası durum içindir.

### Yapılandırma Dosyası

agentmemory runtime yapılandırmasını her shell'de değişkenleri export etmek yerine `~/.agentmemory/.env`'a koyun. Görüntüleyici `export ANTHROPIC_API_KEY=...` gibi bir kurulum ipucu gösteriyorsa, `export` ön ekini koymadan bu dosyaya `ANTHROPIC_API_KEY=...` olarak kopyalayın, ardından agentmemory'yi yeniden başlatın.

Süreç ortam değişkenleri hâlâ çalışır ve dosyadaki değerlere göre öncelik kazanır.

Windows'ta aynı dosya `%USERPROFILE%\.agentmemory\.env` konumunda bulunur:

```powershell
New-Item -ItemType Directory -Force $HOME\.agentmemory
notepad $HOME\.agentmemory\.env
```

API anahtarı yerine Claude Code Pro/Max aboneliğiyle test etmek için açıkça opt-in yapın:

```env
AGENTMEMORY_ALLOW_AGENT_SDK=true
AGENTMEMORY_AUTO_COMPRESS=true
```

Graph veya konsolidasyon özelliklerini istiyorsanız aynı dosyada açın:

```env
GRAPH_EXTRACTION_ENABLED=true
CONSOLIDATION_ENABLED=true
```

### Ortam Değişkenleri

`~/.agentmemory/.env` oluşturun:

```env
# LLM provider (pick one — default is the no-op provider: no LLM calls)
# ANTHROPIC_API_KEY=sk-ant-...
# ANTHROPIC_BASE_URL=...              # Optional: Anthropic-compatible proxy / Azure
# GEMINI_API_KEY=...
# OPENROUTER_API_KEY=...
# MINIMAX_API_KEY=...
# OPENAI_API_KEY=***                       # NOTE: this same key auto-activates BOTH the
#                                          # OpenAI LLM provider (here) AND the OpenAI
#                                          # embedding provider (further below). Set
#                                          # OPENAI_API_KEY_FOR_LLM=false to scope it
#                                          # to embeddings only.
# OPENAI_BASE_URL=https://api.openai.com   # Optional: override for Azure / vLLM / LM Studio / proxies
#                                          # Azure: https://<resource>.openai.azure.com/openai/deployments/<deployment>
#                                          # Auto-detected from `.openai.azure.com` hostname; uses
#                                          # api-key header + api-version query param.
# OPENAI_API_VERSION=2024-08-01-preview    # Optional: Azure api-version query param
# OPENAI_MODEL=gpt-4o-mini                 # Optional: default model
# OPENAI_TIMEOUT_MS=60000                  # Optional: OpenAI-scoped alias for the outbound fetch
#                                          # timeout. Takes precedence over AGENTMEMORY_LLM_TIMEOUT_MS
#                                          # for back-compat with v0.9.17. New configs should
#                                          # prefer the global AGENTMEMORY_LLM_TIMEOUT_MS below.
# OPENAI_REASONING_EFFORT=none             # Optional: "low" | "medium" | "high" | "none"
#                                          # Honored only by OpenAI's reasoning models (o1, o3,
#                                          # gpt-*-reasoning) and providers that mirror that
#                                          # schema (Ollama Cloud thinking models). Standard
#                                          # chat models reject this field with 400. Set to
#                                          # "none" for thinking models that return reasoning
#                                          # but no content.
# OPENAI_API_KEY_FOR_LLM=false             # Optional: set to false to skip OpenAI auto-detection
#                                          # for LLM (useful if you only want OpenAI for embeddings)
# Opt-in Claude-subscription fallback (spawns @anthropic-ai/claude-agent-sdk);
# leave OFF unless you understand the Stop-hook recursion risk:
# AGENTMEMORY_ALLOW_AGENT_SDK=true

# Embedding provider (auto-detected, or override)
# EMBEDDING_PROVIDER=local
# VOYAGE_API_KEY=...
# OPENAI_API_KEY=sk-...
# OPENAI_BASE_URL=https://api.openai.com   # Override for Azure / vLLM / LM Studio / proxies
# OPENAI_EMBEDDING_MODEL=text-embedding-3-small
# OPENAI_EMBEDDING_DIMENSIONS=1536        # Required when the model is not in the known-models table

# Outbound LLM / embedding timeout
# AGENTMEMORY_LLM_TIMEOUT_MS=60000       # Default: 60 000 ms (60 s). Applies to every
                                          # raw-fetch provider (Gemini, OpenRouter, MiniMax,
                                          # OpenAI LLM, OpenAI/Cohere/Voyage/OpenRouter
                                          # embedding). For the OpenAI LLM path, the
                                          # OpenAI-scoped OPENAI_TIMEOUT_MS alias (above)
                                          # takes precedence when set, for back-compat
                                          # with v0.9.17.
                                          # Increase for slow networks or large batch calls;
                                          # decrease to fail-fast on rate-limit holds.

# Search tuning
# BM25_WEIGHT=0.4
# VECTOR_WEIGHT=0.6
# TOKEN_BUDGET=2000

# Auth
# AGENTMEMORY_SECRET=your-secret

# Ports (defaults: 3111 API, 3113 viewer)
# III_REST_PORT=3111

# Features
# AGENTMEMORY_AUTO_COMPRESS=false  # OFF by default. When on,
                                   # every PostToolUse hook calls your
                                   # LLM provider to compress the
                                   # observation — expect significant
                                   # token spend on active sessions.
# AGENTMEMORY_SLOTS=false          # OFF by default. Editable pinned
                                   # memory slots — persona,
                                   # user_preferences, tool_guidelines,
                                   # project_context, guidance,
                                   # pending_items, session_patterns,
                                   # self_notes. Size-limited; agent
                                   # edits via memory_slot_* tools.
                                   # Pinned slots addressable for
                                   # SessionStart injection.
# AGENTMEMORY_REFLECT=false        # OFF by default. Requires SLOTS=on.
                                   # Stop hook fires mem::slot-reflect:
                                   # scans recent observations, auto-
                                   # appends TODOs to pending_items,
                                   # counts patterns in
                                   # session_patterns, records touched
                                   # files in project_context. Fire-
                                   # and-forget; does not block.
# AGENTMEMORY_INJECT_CONTEXT=false # OFF by default. When on:
                                   # - SessionStart may inject ~1-2K
                                   #   chars of project context into
                                   #   the first turn of each session
                                   #   (this is what actually reaches
                                   #   the model — Claude Code treats
                                   #   SessionStart stdout as context)
                                   # - PreToolUse fires /agentmemory/enrich
                                   #   on every file-touching tool call
                                   #   (resource cleanup, not a token
                                   #   fix — PreToolUse stdout is debug
                                   #   log only per Claude Code docs)
                                   # Observations are still captured via
                                   # PostToolUse regardless of this flag.
# GRAPH_EXTRACTION_ENABLED=false
# CONSOLIDATION_ENABLED=true
# LESSON_DECAY_ENABLED=true
# OBSIDIAN_AUTO_EXPORT=false
# AGENTMEMORY_EXPORT_ROOT=~/.agentmemory
# CLAUDE_MEMORY_BRIDGE=false
# SNAPSHOT_ENABLED=false

# Team
# TEAM_ID=
# USER_ID=
# TEAM_MODE=private

# Tool visibility: "core" (8 tools) or "all" (51 tools)
# AGENTMEMORY_TOOLS=core
```

---

<h2 id="api"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-api.svg"><img src="../assets/tags/section-api.svg" alt="API" height="32" /></picture></h2>

`3111` portunda 124 endpoint. REST API varsayılan olarak `127.0.0.1`'e bağlanır. `AGENTMEMORY_SECRET` ayarlandığında korumalı endpoint'ler `Authorization: Bearer <secret>` gerektirir ve mesh sync endpoint'leri her iki eşte de `AGENTMEMORY_SECRET` gerektirir.

<details>
<summary>Önemli endpoint'ler</summary>

| Method | Path | Açıklama |
|--------|------|-------------|
| `GET` | `/agentmemory/health` | Sağlık kontrolü (her zaman public) |
| `POST` | `/agentmemory/session/start` | Oturum başlat + bağlam al |
| `POST` | `/agentmemory/session/end` | Oturumu bitir |
| `POST` | `/agentmemory/observe` | Gözlem yakala |
| `POST` | `/agentmemory/smart-search` | Hibrit arama |
| `POST` | `/agentmemory/context` | Bağlam üret |
| `POST` | `/agentmemory/remember` | Uzun süreli belleğe kaydet |
| `POST` | `/agentmemory/forget` | Gözlemleri sil |
| `POST` | `/agentmemory/enrich` | Dosya bağlamı + bellekler + bug'lar |
| `GET` | `/agentmemory/profile` | Proje profili |
| `GET` | `/agentmemory/export` | Tüm veriyi dışa aktar |
| `POST` | `/agentmemory/import` | JSON'dan içeri aktar |
| `POST` | `/agentmemory/graph/query` | Bilgi grafı sorgusu |
| `POST` | `/agentmemory/team/share` | Takımla paylaş |
| `GET` | `/agentmemory/audit` | Denetim izi |

Tam endpoint listesi: [`src/triggers/api.ts`](../src/triggers/api.ts)

</details>

---

<h2 id="development"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-development.svg"><img src="../assets/tags/section-development.svg" alt="Development" height="32" /></picture></h2>

```bash
npm run dev               # Hot reload
npm run build             # Production build
npm test                  # 950+ test
npm run test:integration  # API testleri (çalışan servisler gerektirir)
```

**Ön koşullar:** Node.js >= 20, [iii-engine](https://iii.dev/docs) veya Docker

<h2 id="license"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-license.svg"><img src="../assets/tags/section-license.svg" alt="License" height="32" /></picture></h2>

[Apache-2.0](../LICENSE)
