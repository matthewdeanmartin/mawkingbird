# Indonesian (`id`) — locked terminology

Written **before** translating, per the method in the `translate-ui` skill. Every
batch merged into `id.json` follows this table; the merge gate enforces the
mechanical parts (`make i18n-merge L=id F=batch.json`), and this file settles the
parts a tool cannot check.

## Register

**Informal `kamu`, held everywhere.** Never `Anda`. This is a casual social app,
and rule 6 says pick one register and hold it — German shipped 466 keys of `du`
against 321 of `Sie` and every one of those 321 had to be rewritten by hand.
The merge gate **rejects any batch containing `Anda`**, so the split cannot
happen twice.

Where a sentence would need `kamu` three times, prefer the Indonesian habit of
dropping the pronoun entirely (`Hapus postingan ini?` not `Apakah kamu ingin
menghapus postingan kamu ini?`). Omission is neutral; it is not a register slip.

Possessives: `-mu` enclitic (`akunmu`, `postinganmu`) reads naturally and is
shorter than `akun kamu` — useful against `max` budgets.

## Terminology

Anchored on the Indonesian Mastodon translation where one exists, per the anchor
rule: matching vocabulary Indonesian fediverse users already recognise costs
nothing and beats an invented coinage.

| English | Indonesian (use this) | Never |
|---|---|---|
| Boost (verb) | **boost** / mem-boost | dorongan, meningkatkan, tingkatkan |
| Boost (noun) | **boost** | dorongan |
| Post (noun) | **postingan** | tiang, pos, kiriman pos |
| Post (verb) | memposting, kirim | mengeposkan |
| Toot | **toot** (keep the whimsy) | terompet, bunyi klakson |
| Reply | balasan / balas | jawaban |
| Thread | **utas** | benang, ulir |
| Timeline | **linimasa** | garis waktu |
| Feed | **feed** | makanan, umpan-ternak, memberi makan |
| Follow / Unfollow | **ikuti** / **berhenti mengikuti** | membuntuti, menguntit |
| Follower | **pengikut** | |
| Following (list) | **mengikuti** | |
| Mute | **bisukan** | matikan suara, tuli |
| Block | **blokir** | halangi — and must stay distinct from *bisukan* |
| Favourite / Like | **suka** / **favorit** | menyukai-sebagai-mirip |
| Bookmark | **markah** / simpan | penanda buku |
| Filter | **filter** / saringan | saringan kopi |
| Handle | **handle** (`@nama@server`) | gagang, pegangan |
| Instance / Server | **server** / instansi | contoh, kejadian |
| Fediverse | **Fediverse** | |
| Draft | **draf** | rancangan-hukum |
| Reader mode | **mode baca** | |
| Light (theme) | **Terang** | Cahaya, Ringan |
| Dark (theme) | **Gelap** | |
| Paste (pastebin item) | **Paste** (product noun, kept) | tempel, menempel, pasta |
| API call | **permintaan** / panggilan API | panggilan telepon |
| Starter kit | **paket awal** | kotak peralatan pemula |
| Fail whale | **paus gagal** — keep the joke | any literal "whale that failed"; never `Paus` in the Pope sense (capitalised) |
| Interface language | **bahasa antarmuka** | — distinct from *bahasa postingan* (posting language) and *bahasa yang dikuasai* (known languages). All three must stay distinguishable. |
| Settings | **Pengaturan** | Setelan (inconsistent), Setting |
| Search | **Cari** / Pencarian | |
| Export / Import | **Ekspor** / **Impor** | |

## Never translate

`Mockingbird`, `Mawkingbird`, `Mastodon`, `Bluesky`, `Twitter`, `RSS`, `OPML`,
`ActivityPub`, `Raindrop.io`, `OpenRouter`, `Stripe`, `Hugo`, `@handles`,
`#hashtags`, URLs, code samples, `{{placeholders}}`, typeface names.

## Grammar notes for this language

- **No grammatical gender and no verb agreement.** Rule 7 (gender-neutral
  constructions) is free here — nothing around an interpolated username needs to
  agree with it. This is the easiest language in the set for that rule.
- **No plural inflection.** `{{count}} postingan` is correct for 1 and for 1,000.
  Do **not** reduplicate (`postingan-postingan`) to render an English `-s`: it
  means *various assorted posts*, which is a different claim. This also means
  the ICU plural work in sprint ui-i18n-6 needs only an `other` category here.
- **Affixation changes part of speech**, and UI labels are usually the bare root:
  a button is `Hapus` (delete), not `Menghapus`. Reserve `me-` forms for running
  prose and `-an` nominalisations for headings.
- **Indonesian runs longer than English** — roughly 15–20% more characters for
  the same sentence, because affixes replace short English particles. `max` is
  binding; prefer the bare root form and the `-mu` enclitic to fit.
- **Loanwords are normal and expected.** Indonesian technical registers borrow
  freely (`unggah`/`upload`, `salin`/`copy`). Prefer the established Indonesian
  word where one is in common use, but do not coin a purist neologism for a term
  Indonesian speakers already use in English — that is the Icelandic strategy,
  not this one.

## Terminology feature is English-only by decree

The post/tweet/florp/skeet/toot vocabulary picker does not get an Indonesian
`florp`. Those keys are already excluded from the work order.

## Rule 9 applies

If genuinely unsure of a term, **leave the key out**. A missing key falls back to
English cleanly; a confidently wrong translation is invisible to a maintainer who
does not read Indonesian, and therefore permanent.

## Corrections log

Append every correction found after a batch merges. This is what makes quality
rise across batches instead of staying flat — the French pass caught its own
`·e` violation in batch C by reading batch B's note.
