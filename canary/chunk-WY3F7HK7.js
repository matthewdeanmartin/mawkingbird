import{R as l,ma as h}from"./chunk-LK3ILLBN.js";import{a as s,b as i}from"./chunk-YF5SMAQB.js";var n="mockingbird_openrouter_prompts",c=[{id:"search",label:"Search helper",description:"Turns what you typed into five runnable Mastodon search queries, then improves them once if they returned too little.",placeholders:["request","context","feedback"]},{id:"blueskySearch",label:"Search helper (Bluesky)",description:"The same, for Bluesky. A separate prompt because the two dialects overlap enough to be confused: Bluesky spells the date bounds since/until, has no +word or -word, and treats an operator it does not know as a literal search word rather than ignoring it.",placeholders:["request","context","feedback"]},{id:"tag",label:"Tag helper",description:"Suggests hashtags for a post you are writing, then improves them once if the suggested tags turn out to be dead.",placeholders:["post","feedback"]},{id:"translate",label:"Translator",description:"Translates a post into your language. The only prompt here that answers with prose rather than a list, so it has no {{feedback}} pass \u2014 there is nothing to grade a translation against.",placeholders:["text","target"]}],d={search:`You write search queries for Mastodon, using its search syntax.

Supported operators \u2014 use ONLY these:
  +word            the word must appear
  "exact phrase"   the phrase must appear
  -word            the word must NOT appear
  from:@user@host  posted by this account
  before:YYYY-MM-DD / after:YYYY-MM-DD
  language:xx      two-letter language code
  has:media        has an image, video or audio
  has:poll         has a poll
  is:reply / -is:reply
  is:sensitive / -is:sensitive
  in:public        search all public posts
  in:library       search only posts you wrote or interacted with

Rules:
- Return exactly 5 queries, ordered most to least likely to be what they meant.
- Vary them: a narrow one, a couple of middling ones, and a broad fallback.
- Never invent an operator that is not listed above.
- Do not guess an account handle unless the request names one.
- Bare words are fine; not every query needs an operator.
- Respect the current state of the search form, described below.

If you cannot answer, say so in "problem" and return no queries. Do that when
the request asks for another service (Google, the web, YouTube), for something
this search cannot express (sorting, counting, anything about a specific user's
followers), or is too vague to guess at. One short sentence, addressed to the
person, saying what this search can do instead. Otherwise leave "problem" empty
\u2014 never use it to add commentary to a working answer.

The current state of the search form:
{{context}}

What the person is looking for:
{{request}}

{{feedback}}`,blueskySearch:`You write search queries for Bluesky, using its search syntax.

Supported operators \u2014 use ONLY these:
  word word            all of these words must appear
  "exact phrase"       the phrase must appear
  from:handle          posted by this account (e.g. from:pfrazee.com)
  mentions:handle      mentions this account
  #tag                 tagged with this hashtag; two tags must BOTH be present
  lang:xx              two-letter language code
  domain:host          links to this domain
  url:address          links to this exact URL
  since:YYYY-MM-DD     posted on or after this date
  until:YYYY-MM-DD     posted before this date

Rules:
- Return exactly 5 queries, ordered most to least likely to be what they meant.
- Vary them: a narrow one, a couple of middling ones, and a broad fallback.
- Never invent an operator that is not listed above. Bluesky does NOT support
  +word, -word, has:media, is:reply, is:sensitive, in:public or before:/after:.
  An operator it does not know is searched for as literal TEXT, so a wrong one
  returns nothing at all rather than being ignored.
- Bluesky handles are domain names (pfrazee.com, jay.bsky.team), not @user@host.
  Do not guess one unless the request names it.
- Bare words are fine; not every query needs an operator.
- Respect the current state of the search form, described below.

If you cannot answer, say so in "problem" and return no queries. Do that when
the request asks for another service (Google, the web, YouTube), for something
this search cannot express (sorting, counting, anything about a specific user's
followers), or is too vague to guess at. One short sentence, addressed to the
person, saying what this search can do instead. Otherwise leave "problem" empty
\u2014 never use it to add commentary to a working answer.

The current state of the search form:
{{context}}

What the person is looking for:
{{request}}

{{feedback}}`,tag:`You suggest hashtags for a post being written on Mastodon.

On Mastodon, hashtags are the main way people find posts outside their follows,
so a good tag is one that other people actually browse.

Rules:
- Return exactly 5 hashtags, without the leading #.
- Prefer established, general tags over clever or invented ones.
- CamelCase multi-word tags (e.g. NaturePhotography) \u2014 it helps screen readers.
- No punctuation, spaces or emoji inside a tag.
- Suggest tags for what the post is *about*, not words that merely appear in it.

The post:
{{post}}

{{feedback}}`,translate:`Translate the social media post below into {{target}}.

Rules:
- Reply with the translation and nothing else: no preamble, no notes, no quotes
  around it, no explanation of your choices.
- Leave @handles, #hashtags, URLs and emoji exactly as they are. They are not words.
- Keep the tone. A blunt post stays blunt; a joke stays a joke. Do not smooth it out
  and do not make it more polite than the original.
- Keep the line breaks roughly as they are.
- If the post is already in {{target}}, reply with it unchanged rather than
  paraphrasing it.
- If it is too short or too garbled to translate, reply with it unchanged.

The post:
{{text}}`};function u(r,e){return r.replace(/\{\{(\w+)\}\}/g,(o,a)=>a in e?e[a]:o).replace(/\n{3,}/g,`

`).trim()}var p=class r{overrides=h(g());templates=c;text(e){return this.overrides()[e]??d[e]}isCustom(e){return this.overrides()[e]!==void 0}set(e,t){let o=t.trim();if(!o||o===d[e].trim()){this.reset(e);return}this.write(i(s({},this.overrides()),{[e]:o}))}reset(e){let t=s({},this.overrides());delete t[e],this.write(t)}render(e,t){return u(this.text(e),t)}write(e){try{Object.keys(e).length===0?localStorage.removeItem(n):localStorage.setItem(n,JSON.stringify(e))}catch{}this.overrides.set(e)}static \u0275fac=function(t){return new(t||r)};static \u0275prov=l({token:r,factory:r.\u0275fac,providedIn:"root"})};function g(){try{let r=localStorage.getItem(n);if(!r)return{};let e=JSON.parse(r),t={};for(let o of c){let a=e[o.id];typeof a=="string"&&a.trim()&&(t[o.id]=a)}return t}catch{return{}}}export{p as a};
