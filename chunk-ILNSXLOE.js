import{b as w}from"./chunk-CTDIVCAQ.js";import{P as a,ka as i}from"./chunk-JOF57VVU.js";import{a as p,b}from"./chunk-7CGTOI24.js";var O="https://openrouter.ai/api/v1/models",k=20,l="google/gemma-4-31b-it",S="structured_outputs",v=class t{cache=new Map;searching=i(!1);async search(e,r={}){let o=r.structuredOnly??!0,m=e.trim()||l,g=`${m}::${o}`,f=this.cache.get(g);if(f)return f;let c=new URL(O);c.searchParams.set("q",m),c.searchParams.set("limit",String(k)),o&&c.searchParams.set("supported_parameters",S),this.searching.set(!0);try{let d=await fetch(c.toString());if(!d.ok)throw new Error(await w(d,"Couldn't reach OpenRouter's model list."));let y=((await d.json()).data??[]).filter(s=>typeof s.id=="string").map(s=>({id:s.id,name:s.name??s.id,contextLength:s.context_length??null,promptPrice:T(s.pricing?.prompt),completionPrice:T(s.pricing?.completion)}));return this.cache.set(g,y),y}finally{this.searching.set(!1)}}static \u0275fac=function(r){return new(r||t)};static \u0275prov=a({token:t,factory:t.\u0275fac,providedIn:"root"})};function T(t){if(t===void 0)return null;let e=Number(t);return Number.isFinite(e)?e:null}function q(t){if(t===null)return null;if(t===0)return"free";let e=t*1e6;return`$${e<.01?e.toFixed(4):e.toFixed(2)} / M tokens`}var h="mockingbird_openrouter_model",P=class t{modelId=i(D());set(e){let r=e.trim();if(r){try{localStorage.setItem(h,r)}catch{}this.modelId.set(r)}}reset(){try{localStorage.removeItem(h)}catch{}this.modelId.set(l)}isDefault(){return this.modelId()===l}static \u0275fac=function(r){return new(r||t)};static \u0275prov=a({token:t,factory:t.\u0275fac,providedIn:"root"})};function D(){try{return localStorage.getItem(h)||l}catch{return l}}var u="mockingbird_openrouter_prompts",R=[{id:"search",label:"Search helper",description:"Turns what you typed into five runnable Mastodon search queries, then improves them once if they returned too little.",placeholders:["request","context","feedback"]},{id:"tag",label:"Tag helper",description:"Suggests hashtags for a post you are writing, then improves them once if the suggested tags turn out to be dead.",placeholders:["post","feedback"]},{id:"translate",label:"Translator",description:"Translates a post into your language. The only prompt here that answers with prose rather than a list, so it has no {{feedback}} pass \u2014 there is nothing to grade a translation against.",placeholders:["text","target"]}],M={search:`You write search queries for Mastodon, using its search syntax.

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
{{text}}`};function L(t,e){return t.replace(/\{\{(\w+)\}\}/g,(o,n)=>n in e?e[n]:o).replace(/\n{3,}/g,`

`).trim()}var x=class t{overrides=i(_());templates=R;text(e){return this.overrides()[e]??M[e]}isCustom(e){return this.overrides()[e]!==void 0}set(e,r){let o=r.trim();if(!o||o===M[e].trim()){this.reset(e);return}this.write(b(p({},this.overrides()),{[e]:o}))}reset(e){let r=p({},this.overrides());delete r[e],this.write(r)}render(e,r){return L(this.text(e),r)}write(e){try{Object.keys(e).length===0?localStorage.removeItem(u):localStorage.setItem(u,JSON.stringify(e))}catch{}this.overrides.set(e)}static \u0275fac=function(r){return new(r||t)};static \u0275prov=a({token:t,factory:t.\u0275fac,providedIn:"root"})};function _(){try{let t=localStorage.getItem(u);if(!t)return{};let e=JSON.parse(t),r={};for(let o of R){let n=e[o.id];typeof n=="string"&&n.trim()&&(r[o.id]=n)}return r}catch{return{}}}export{l as a,v as b,q as c,P as d,x as e};
