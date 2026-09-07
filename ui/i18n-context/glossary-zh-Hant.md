# Traditional Chinese for Taiwan (`zh-Hant`)

Approved foundation, 2026-09-05. This is Taiwan-oriented interface language,
not Taiwanese Hokkien and not a conversion of Simplified Chinese text.
Use Traditional characters and Taiwan vocabulary. The picker reads
`繁體中文（台灣，翻譯中）`. The locale remains in progress.

## Register and typography

Neutral, concise, friendly UI prose. Prefer omitting the reader pronoun; when
needed consistently use 您, matching Mastodon's Taiwan interface. Avoid ornate
敬請/惠予 or bureaucratic prose. Labels are short nouns/verbs, warnings explicit.
Use Chinese punctuation （）：「」？！ and natural measure words (則嘟文、位使用者).
Keep placeholders, HTML, code, URLs, handles and product names exact. Do not add
spaces between Chinese words. A space around a Latin product name is normally
readable; copied syntax must remain unchanged. Unknown gender requires no pronoun
guess: use the name or restructure.

## Mastodon anchor and local product choices

Primary anchor inspected 2026-09-05:
[Mastodon zh-TW interface](https://github.com/mastodon/mastodon/blob/main/app/javascript/mastodon/locales/zh-TW.json).
Verified keys include `account.follow`, `account.unfollow`, `account.posts`,
`account.filters.boosts_toggle`, `account.mute_short`, `account.block_short`,
`account.menu.hide_reblogs`, and `account.name.help.header`.
The table locks product decisions where Mastodon does not have a direct analogue.

| English | Use | Avoid / distinction |
|---|---|---|
| Boost, noun/verb | 轉嘟 | Not 助推、增幅、推廣; an unmodified reshare |
| Post, social noun | 嘟文 | For cross-network generic content use 貼文 when context demands; never mail or job position |
| Post, verb | 發佈 | 發佈嘟文; not a physical post |
| Toot | 嘟文 / 發嘟 | Preserve the Mastodon whimsy |
| Handle | 帳號代稱 | Exact @user@server remains unchanged; never 把手 |
| Instance / server | 伺服器 | Never 實例 or 服務器 for a fediverse server |
| Feed | 動態消息 | RSS feed = RSS 訂閱來源; never 飼料 |
| Timeline | 時間軸 | Mastodon convention; do not invent chronological-history terminology |
| Thread | 討論串 | Reply = 回覆; not sewing or screw thread |
| Follow / unfollow | 跟隨 / 取消跟隨 | Mastodon Taiwan anchor; not 關注 or stalking |
| Mute / unmute | 靜音 / 解除靜音 | Hide posts; distinct from contact-blocking |
| Block / unblock | 封鎖 / 解除封鎖 | Never substitute 靜音; verify reversals in bulk actions |
| Filter | 篩選器; verb 篩選 | Content rule, not camera effect |
| Like / favourite | 喜歡 / 加入最愛 | Bookmarks = 書籤; do not collapse these separate actions |
| Light / dark theme | 淺色 / 深色主題 | Not illumination or weight |
| Paste, product item | Paste | Product noun stays recognisable; paste verb = 貼上 |
| API call | API 請求 | Not a telephone call |
| Current account | 目前使用的帳號 | Not 活期帳戶 |
| Fediverse | 聯邦宇宙 | Established Mastodon term |
| Fail whale | 鯨魚又來搗蛋了 | Adapt mascot joke to context; never 失敗的鯨魚 |
| Starter kit | 推薦跟隨名單 | A curated set of accounts; RSS version = 推薦訂閱組合 |
| Interface language | 介面語言 | Not posting/known languages |
| Posting language | 發文語言 | Language assigned to the post |
| Known languages | 看得懂的語言 | Reader's comprehension preferences |
| Settings / software / account | 設定 / 軟體 / 帳號 | Not 設置 / 軟件 / 賬號 |
| Save / delete / cancel | 儲存 / 刪除 / 取消 | Do not weaken destructive-action wording |

## Message structure and batching

Verified optional English vocabulary parameters in
`ui/scripts/i18n-optional-terminology.mjs` may be omitted in favor of inflected
canonical Chinese nouns. Preserve real counts, names and data. The resume review
includes existing Chinese strings still interpolating those English-only nouns.

Chinese cardinal plurals have only `other`; existing English `.one`/`.other`
**complete message pairs** may have identical natural Chinese values. Translate
both keys because current call sites still select by English count. Do not emit
ICU syntax: no ICU compiler is installed. A numeric measure word is still needed.
Do not translate suffix fragments as if they were complete words, or force Chinese
into fixed English fragments around interactive links. Report those keys and the
actual call site for source restructuring. Keep missing keys as
English fallback pending the fix, rather than inventing a broken translation.

Use the source-snapshot workflow in the translate-ui skill. Never run
legacy `i18n-todo` to certify freshness. Ledger absence means stale, not approved.

## Corrections and discoveries

- Direct-authoring redo review: Follower = 跟隨者 (not alternating 追隨者);
  mutual relationship = 互相跟隨, not shared followees (共同跟隨).
  Connection-doctor control probe = 對照主機/對照列. Search lastYear is
  withinDays:365, so 最近一年, not 去年. Bluesky Top ranking = 熱門;
  open follow policy = 無須核准/開放跟隨, not the action 開啟.
- Do not say an unverified app is currently under review: that status only says
  it has not been verified. A remembered Blogger name names a blog, not an account.
- Directly authored long strings still must retain distinct examples and
  explanations. Keep the is.gd outage-report example and missing-link explanation
  in doctor.explain.p5b and the query-operator consequence in accountHelp.caveat.

- Foundation: `zh-Hant` and explicit `Hant` variants, plus `zh-TW/HK/MO` without
  an explicit script, negotiate this dictionary on review builds. Bare `zh`,
  `zh-CN/SG`, and explicit `Hans` do not. Explicit script wins even over region.
- Foundation: core social vocabulary follows Mastodon's Taiwan usage (跟隨,
  轉嘟, 嘟文, 靜音, 封鎖); generic Taiwan social vocabulary is not interchangeable
  when it would change established Mastodon action labels.
- Foundation: `humanTime` now reads the selected UI locale live and formats via
  Intl, so relative timestamps are not dictionary translation work.
- Review 2026-09-05: automated drafts were rejected in full; do not normalize
  their vocabulary by global replacement and call that translation. A technical
  `track` can mean 記錄, never social 跟隨. A blog post can mean 部落格文章;
  blindly changing every post into 嘟文 also loses context.
- Composer = 編輯器 / 發文編輯器, never 作曲家. Draft = 草稿, never 吃水 or
  選秀. Draft board = 草稿看板, never 董事會. CW = 內容警告, never 連續波.
- Handle = 帳號代稱, never 手把/句柄. Bio = 個人簡介, never BIOS or 履歷.
  Mutuals = 互相跟隨; BOT = 機器人, never finance terms. Block = 封鎖,
  not 凍結帳戶 or 區塊. Most boosted = 轉嘟次數最多, not 最受鼓舞/升壓.
- Access token = 存取權杖; API key = API 金鑰. Distinguish AI token (token /
  詞元 in model context) from credentials. Credits = 點數 / 可用點數,
  never 製作人員; credit balance is a spending balance. Keep future credential
  expiry in the future (將於…), not already deleted (已於…).
- Query operator = 搜尋運算子, never 操作員/運營商. Match = 符合 / 相符,
  never 比賽. min/max = 最小值/最大值 or 最少/最多 as context needs;
  min is not minutes. Refresh = 重新整理, not 清爽. Collapse repeated =
  收合重複內容, not 反覆崩潰. A top-level post is 討論串首篇, not 頂級職位.
- Keep provider/model names unchanged: Mastodon, Bluesky, Blogger, Google,
  Hugo, Mataroa, OpenRouter, GitHub Gist, Raindrop.io, Dub, Short.io, Mawkingbird,
  gemma, haiku, mistral. Names are not dictionary words even when familiar.
- Preserve copied syntax including `x-api-key`, `main`, `content/posts`,
  `you/your-blog`, `handle.bsky.social`, scope `gist`, hashtag examples
  `angular typescript` / `react vue`, and the literal split marker `---`.
  Translating surrounding instructions is required. Never replace `---` with
  a Chinese dash, or `main` with 主要, when users must enter that exact syntax.
- Taiwan UI: 個人檔案 (social profile), 分頁 (browser tab), 網域, 清單,
  檔案, 載入, 匯入/匯出, 登入/登出, 公開/不公開, 篩選, 模型, 排程.
  Simplified strings such as 发布/校对/然后 cannot ship in this locale.
- Review lesson: connector labels may be assembled from fragments around links or bold
  names. Translate the rendered meaning and coordinate adjacent fragment keys before
  accepting wording; control probes use 對照, and remembered Blogger text describes the
  blog configuration rather than an account.
