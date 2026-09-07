# Korean (`ko`)

Use concise standard Korean UI language. Explanations/status use polite
합니다/입니다; instructions use 하세요; buttons use short action nouns (저장,
취소, 삭제) consistently. Avoid unnecessary reader pronouns and gender assumptions.
Retain playful intent where marked, with precise neutral warnings.

Vocabulary anchor: [Mastodon Korean UI](https://github.com/mastodon/mastodon/blob/main/app/javascript/mastodon/locales/ko.json),
inspected 2026-09-06. The glossary fixes local consistency; do not fetch upstream
answers or use translation services while authoring batches.

| English | Korean | Meaning |
|---|---|---|
| post / publish | 게시물 / 게시 | Social content; blog article = 글 or 기사 |
| boost | 부스트 | Reshare, not paid promotion |
| follow / unfollow | 팔로우 / 언팔로우 | followers = 팔로워; following = 팔로잉 |
| mute / unmute | 뮤트 / 뮤트 해제 | Personal hiding; audio = 음소거 |
| block / unblock | 차단 / 차단 해제 | Preserve reversals; moderation silence = 제한 |
| server / instance | 서버 | Fediverse host, not program instance |
| feed / timeline | 피드 / 타임라인 | RSS 피드; never animal feed |
| thread / reply | 스레드 / 답글 | Conversation, not physical thread |
| handle / account | 사용자명 / 계정 | Preserve literal @user@server |
| like / favourite / bookmark | 좋아요 / 즐겨찾기 / 북마크 | Keep distinct actions |
| light / dark theme | 밝은 테마 / 어두운 테마 | Appearance, not weight |
| filter / API call | 필터 / API 요청 | Content rule; not telephone call |
| Fediverse | 연합우주 | Decentralized social ecosystem |
| starter kit | 스타터 키트 | Curated accounts or RSS feeds |
| interface language | 인터페이스 언어 | Distinct from 게시 언어 and 이해하는 언어 |
| save / delete / cancel | 저장 / 삭제 / 취소 | Keep destructive actions explicit |
| Paste | Paste | Product item; clipboard action = 붙여넣기 |

Keep Mockingbird, Mawkingbird, Mastodon, Bluesky, Twitter, ActivityPub, RSS, OPML,
OpenRouter, Stripe, Raindrop.io, Hugo, typefaces, code, URLs and `dnt` values intact.
Local timeline means this server; Friends means followed accounts. Credits on
attribution pages means 감사의 말. Search saved is a confirmation. Preserve
counterexamples, exclusions, and what each numeric parameter measures.

Korean has no English-style singular/plural noun inflection. Existing complete
`.one`/`.other` messages may use identical natural Korean. Use counters matching
the subject (people 명, posts 개/건), or natural labelled totals. No ICU syntax.
Do not attach pronunciation-dependent particles blindly to unknown names:
prefer `{{name}} 님`, labels, or restructuring without alternate `(이)가` endings.
Preserve every real-data parameter. Only the work order's explicit
optionalParameters may be replaced by the canonical Korean noun; never omit a
count, user name or other data. Report untranslatable fragments by exact ID.
