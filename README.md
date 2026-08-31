# skillbench

> Kodlama ajanı skill'leri için **lint + gerçek kullanım kanıtı**. Üç soruyu cevaplar:
> skill'im doğru yazılmış mı, **gerçekten tetikleniyor mu**, başka bir skill'in işine mi
> giriyor? Claude Code, Codex CLI ve Gemini CLI'daki skill'leri birlikte görür.
> Ağ çağrısı yok, kota harcanmaz.
>
> *English summary below.*

**Site:** https://hailneed.github.io/skillbench/

Bir skill'in sessizce hiç açılmaması, kırık olmasından daha sık görülür ve fark etmesi çok
daha zordur. `skillbench` bunu tahmin etmez: aktivasyon kaydını oturum geçmişinden okur.

## Ne yapar?

| Komut                        | Ne verir                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `/skillbench:lint [yol]`     | **Lint**: frontmatter sözleşmesi, açıklama kalitesi (tetikleyici ifade, negatif sınır), gövde boyutu, kırık referans, taşınabilirlik, izin genişliği, eval kapsamı |
| `/skillbench:coverage`       | **Gerçek kullanım**: hangi skill kaç kez, kaç oturumda, hangi projede ateşledi; hiç açılmayanlar ve nedeni       |
| `/skillbench:collide`        | **Çakışma ve sürüklenme**: hangi iki açıklama aynı isteğe aday oluyor ve hangi kelimeler yüzünden; çoklu ajana kopyalanmış skill'lerin kopyaları hâlâ aynı mı |

26 lint kuralı, üç önem düzeyi (`hata` / `uyarı` / `bilgi`) ve her kural için "neden önemli"
ile "nasıl düzeltilir" satırı. Kural motoru şeffaftır — beğenmediğini `--ignore` ile
kapatırsın.

## Gerçek kullanım nasıl ölçülüyor?

Claude Code her araç çağrısında **hangi skill'in aktif olduğunu** transcript'e yazıyor
(`attributionSkill` / `attributionPlugin`). `skillbench` bu alanı okuyup skill başına çağrı,
farklı oturum sayısı, proje ve son kullanım tarihine çeviriyor.

> **Codex CLI ve Gemini CLI bu bilgiyi yapısal olarak kaydetmiyor.** O ajanlardaki skill'ler
> raporda "ölçülemedi" olarak geçer — "hiç kullanılmadı" olarak **değil**. Canlı tetiklenme
> testi (`claude -p` ile ölçüm) v0.2'ye bırakıldı çünkü kota harcıyor.

Bu ayrım ürünün merkezinde: sayı yoksa "sayı yok" yazar, tahmin üretmez.

## Desteklenen konumlar

| Konum | Ne | Durum |
|---|---|---|
| `~/.claude/skills/<ad>/SKILL.md` | Claude Code kullanıcı skill'i | **doğrulandı** |
| `~/.claude/skills/<plugin>/skills/…` | plugin olarak kurulmuş paket (symlink dahil) | **doğrulandı** |
| `~/.claude/plugins/cache/…` | kurulu marketplace plugin'i | **doğrulandı** |
| `~/.claude/plugins/marketplaces/…` | katalog girdisi (kurulu değil) | `--catalog` ile dahil edilir; dosya ve eval denetimleri atlanır |
| `~/.gemini/skills/<ad>/SKILL.md` | Gemini CLI | **doğrulandı** |
| `~/.codex/skills/<ad>/SKILL.md` | Codex CLI (`.system/` yerleşikleri dahil) | **doğrulandı** |
| `--path <depo>` | geliştirmekte olduğun depo | ana geliştirme modu |

Sembolik bağlar izlenir: `~/.claude/skills/<ad>` sık sık geliştirme deposuna bağlanır ve
`Dirent.isDirectory()` bir symlink için `false` döndüğü için naif bir tarayıcı o skill'leri
tamamen kaçırır.

## Kurulum

```
# Claude Code içinde, bir kez marketplace ekle:
/plugin marketplace add hailneed/plugins
/plugin install skillbench@hailneed
```

Sonra dene:

```
/skillbench:coverage
```

Gereksinim: Claude Code + Node.js 18+. Bağımlılık yok, API anahtarı yok.

## Plugin'siz kullanım

```
git clone https://github.com/hailneed/skillbench
cd skillbench

node scripts/skillbench.mjs --list --md                  # bulunan skill'ler
node scripts/skillbench.mjs --lint --path ../my-plugin --md
node scripts/skillbench.mjs --coverage --days 90 --md    # gerçek aktivasyon
node scripts/skillbench.mjs --collide --md               # çakışma + sürüklenme
node scripts/skillbench.mjs --selftest                   # kural öz-testi (ağ/disk yok)
```

Bayraklar: `--agent all|claude-code|codex|gemini-cli` · `--path DIZIN` · `--catalog` ·
`--lang tr|en` · `--out DOSYA` · `--limit N` · `--ignore kural1,kural2`.

CI'da `--lint --path . --out lint.json` çalıştırıp `score.raw` değerini eşiğe bağlayabilirsin;
çıktı formatı sabittir ve `--selftest` ağ gerektirmez.

## Nasıl çalışır?

1. **Keşif** (`scripts/lib/skills.mjs`) üç ajanın skill köklerini ve plugin dizinlerini
   gezer, frontmatter'ı öngörülebilir bir YAML alt kümesiyle ayrıştırır, gövdedeki dosya
   atıflarını çıkarır ve çözer. Bir yol; skill'in kendi dizini, kardeş skill'ler ve plugin
   kökü üzerinden denenir — çapraz atıflar kırık gibi raporlanmaz.
2. **Kurallar** (`scripts/lib/checks.mjs`) 26 denetimi uygular; ayrıca açıklama benzerliğini
   idf ağırlıklı kosinüsle ölçer ve çoklu kopyaların içerik parmak izini karşılaştırır.
3. **Aktivasyon** (`scripts/lib/adapters.mjs`) — `agent-blackbox`'tan gelen ortak adaptör
   katmanı; oturum kayıtlarını tek olay şemasına çevirir, skill atıfları oradan okunur.
4. **Skill'ler** çıktıyı yorumlar: `lint` bulguları düzenlemeye çevirir, `coverage` soğuk
   bir skill'in dört olası nedenini ayırt eder, `collide` çakışmayı **tek taraflı** bir sınır
   satırı ekleyerek çözmeyi önerir.

## Yol haritası (ve nasıl para kazanır)

- **v0.1 (bu repo):** 3 skill + bağımlılıksız tarayıcı + 26 kural, MIT.
- **v0.2:** canlı tetiklenme testi (`should_trigger` / `should_not_trigger` prompt'larını
  gerçekten çalıştırıp oran ölçme, bütçe kapısıyla), açıklama yeniden yazma önerisi ve
  öncesi/sonrası tetiklenme karşılaştırması, `--format sarif`, GitHub Action.
- **Skillbench Cloud (ücretli, opsiyonel):** ekip skill kütüphanesi için sürekli ölçüm,
  açıklama değişikliğinin tetiklenmeye etkisini gösteren regresyon geçmişi, marketplace
  yayıncıları için yayın öncesi kapı. Plugin ücretsiz kalır.
  Bekleme listesi: https://hailneed.github.io/skillbench/#cloud

Bu depo `agentlens` ailesinin parçası: adaptör katmanı `agent-blackbox` ile paylaşılır,
kanonik kopya orada durur.

---

## English summary

**skillbench** is lint plus real-usage evidence for coding-agent skills. It answers three
questions:

- **`/skillbench:lint`** — is the skill written correctly? 26 transparent checks across
  frontmatter, activation quality, structure, references, portability, tool permissions and
  eval coverage. Works on a repo you are developing (`--path`) or on every skill installed
  across Claude Code, Codex CLI and Gemini CLI.
- **`/skillbench:coverage`** — does it actually fire? Claude Code records which skill was
  active for each tool call; this counts real activations per skill, with distinct sessions,
  projects and recency, and lists the ones that never fired.
- **`/skillbench:collide`** — do two skills compete for the same request? An idf-weighted
  overlap score with the shared terms that blur the boundary, plus drift detection for
  skills mirrored into several agent homes.

**Honest by construction:** only Claude Code stores skill attribution. Skills on Codex CLI
and Gemini CLI are reported as *unmeasured*, never as *unused*. Live trigger testing is
deliberately deferred to v0.2 because it costs quota.

**Nothing leaves your machine.** No network calls, no API key, no quota. Node.js 18+, no
dependencies.

```
/plugin marketplace add hailneed/plugins
/plugin install skillbench@hailneed
```

Or standalone: `node scripts/skillbench.mjs --coverage --md --lang en`. MIT.
