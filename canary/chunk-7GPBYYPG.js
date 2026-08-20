import{a as k}from"./chunk-DVNJI57F.js";import{a as S}from"./chunk-YWWXYDNK.js";import{b as p,c as G,f as H}from"./chunk-NJKC5PDT.js";import{k as g}from"./chunk-HJAC43NC.js";import{R as y,W as d,ma as o}from"./chunk-L37VBGPQ.js";import{a as l,b as u}from"./chunk-7CGTOI24.js";var U="mockingbird_github_user",a="mockingbird_github_credentials",P="https://api.github.com",N="2026-03-10",v=class n{bridge=d(S);accountKey=d(k);userKey=g(U);credentialsKey=g(a);token=o(E(this.userKey,this.credentialsKey));user=o(this.token()?.user??null);connected=o(this.token()!==null);notifications=o(null);following=o(null);needsFetch=o(!1);constructor(){this.enforceLifetime()}async connect(e){let t=e.trim();if(!t)throw new Error("Paste a GitHub personal access token (classic).");let r=await f("/user",t);return this.persist(p({accessToken:t}),r),this.bridge.writeThrough(a,T(t,r),this.accountKey.current()),r}accessToken(){let e=this.token()?.accessToken;if(e)return e;let t=this.bridge.readThrough(a,this.accountKey.current());if(!t)return null;let r=A(t);return r?(this.persist(p({accessToken:r.accessToken}),r.user),r.accessToken):null}persist(e,t){localStorage.setItem(this.userKey,JSON.stringify(t)),localStorage.setItem(this.credentialsKey,JSON.stringify(e)),this.token.set(u(l({},e),{user:t})),this.user.set(t),this.connected.set(!0),this.needsFetch.set(!1)}async syncToVault(){let e=this.token();return e?this.bridge.writeThrough(a,T(e.accessToken,e.user),this.accountKey.current()):{kind:"skipped"}}expiresAt(){return G(this.token()?.connectedAt)}enforceLifetime(){let e=this.token();if(!e)return;let t=this.bridge.verdictFor(a,e.connectedAt);t.kind==="disconnect"?this.disconnect():t.kind==="lock"&&(this.forgetLocally(),this.needsFetch.set(!0))}async runProof(){let e=this.accessToken();if(!e)throw new Error("Connect GitHub first.");try{let[t,r]=await Promise.all([f("/notifications?all=false&participating=false&per_page=10",e),f("/user/following?per_page=10",e)]);this.notifications.set(t),this.following.set(r)}catch(t){throw t instanceof c&&t.status===401&&this.disconnect(),t}}async followedUsers(e=null){let t=await this.graphQl(x,e),r=t.data?.viewer?.following;if(!r)throw new Error(t.errors?.[0]?.message??"GitHub did not return followed accounts.");return{users:r.nodes,hasNextPage:r.pageInfo.hasNextPage,endCursor:r.pageInfo.endCursor}}async starredRepositoryOwners(e=null){let t=await this.graphQl(C,e),r=t.data?.viewer?.starredRepositories;if(!r)throw new Error(t.errors?.[0]?.message??"GitHub did not return your starred repositories.");let s=new Map;for(let i of r.nodes){let h=u(l({},i.owner),{bio:i.owner.bio??i.owner.description??null,socialAccounts:i.owner.socialAccounts??{nodes:[]}}),b=h.login.toLowerCase(),m=s.get(b),w={nameWithOwner:i.nameWithOwner,url:i.url,description:i.description};m?m.repositories.push(w):s.set(b,{profile:h,repositories:[w]})}return{owners:[...s.values()],repositoryCount:r.nodes.length,hasNextPage:r.pageInfo.hasNextPage,endCursor:r.pageInfo.endCursor}}disconnect(){this.bridge.removeThrough(a,this.accountKey.current()),this.forgetLocally(),this.connected.set(!1),this.needsFetch.set(!1)}forgetLocally(){localStorage.removeItem(this.userKey),localStorage.removeItem(this.credentialsKey),this.token.set(null),this.user.set(null),this.notifications.set(null),this.following.set(null)}async graphQl(e,t){let r=this.accessToken();if(!r)throw new Error("Connect GitHub first.");let s=await fetch(`${P}/graphql`,{method:"POST",headers:{Authorization:`Bearer ${r}`,Accept:"application/vnd.github+json","Content-Type":"application/json","X-GitHub-Api-Version":N},body:JSON.stringify({query:e,variables:{cursor:t}})});if(!s.ok)throw s.status===401&&this.disconnect(),new c(s.status,await O(s));return await s.json()}static \u0275fac=function(t){return new(t||n)};static \u0275prov=y({token:n,factory:n.\u0275fac,providedIn:"root"})},x=`
  query FollowedUsers($cursor: String) {
    viewer {
      following(first: 100, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          login
          name
          avatarUrl
          url
          bio
          websiteUrl
          socialAccounts(first: 10) {
            nodes {
              provider
              displayName
              url
            }
          }
        }
      }
    }
  }
`,C=`
  query StarredRepositoryOwners($cursor: String) {
    viewer {
      starredRepositories(
        first: 100
        after: $cursor
        orderBy: { field: STARRED_AT, direction: DESC }
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          nameWithOwner
          url
          description
          owner {
            login
            avatarUrl
            url
            ... on User {
              name
              bio
              websiteUrl
              socialAccounts(first: 10) {
                nodes {
                  provider
                  displayName
                  url
                }
              }
            }
            ... on Organization {
              name
              description
              websiteUrl
            }
          }
        }
      }
    }
  }
`,c=class extends Error{constructor(t,r){super(r);this.status=t}};async function f(n,e){let t=await fetch(`${P}${n}`,{headers:{Authorization:`Bearer ${e}`,Accept:"application/vnd.github+json","X-GitHub-Api-Version":N}});if(!t.ok)throw new c(t.status,await O(t));return await t.json()}async function O(n){try{let e=await n.json();return n.status===401?"GitHub rejected that token. Check that it is active, then try again.":n.status===403&&e.message?.toLowerCase().includes("scope")?"That token is missing the notifications scope.":e.message??`GitHub returned HTTP ${n.status}.`}catch{return`GitHub returned HTTP ${n.status}.`}}function E(n,e){try{let t=JSON.parse(localStorage.getItem(n)??"null"),r=JSON.parse(localStorage.getItem(e)??"null");if(typeof r?.accessToken!="string"||!r.accessToken||typeof t?.login!="string")return localStorage.removeItem(n),localStorage.removeItem(e),null;let s=H(e,r);return u(l({},s),{user:t})}catch{return localStorage.removeItem(n),localStorage.removeItem(e),null}}function T(n,e){return JSON.stringify({accessToken:n,user:e})}function A(n){try{let e=JSON.parse(n);return typeof e?.accessToken!="string"||!e.accessToken||typeof e.user?.login!="string"||!e.user.login?null:{accessToken:e.accessToken,user:e.user}}catch{return null}}export{v as a};
