import{a as v}from"./chunk-DSBD22IB.js";import{b as T}from"./chunk-CAP7UN4M.js";import{b as d,c as G,e as H,k as S}from"./chunk-7IZSU52J.js";import{p}from"./chunk-POEOP3A5.js";import{R as k,W as g,ma as o}from"./chunk-RNJOGLJX.js";import{a as l,b as u}from"./chunk-ZW5NV4UO.js";var C="mockingbird_github_user",a="mockingbird_github_credentials",N="https://api.github.com",U="2026-03-10",P=class n{bridge=g(S);accountKey=g(v);userKey=p(C);credentialsKey=p(a);token=o(A(this.userKey,this.credentialsKey));user=o(this.token()?.user??null);connected=o(this.token()!==null);notifications=o(null);following=o(null);needsFetch=o(!1);constructor(){this.enforceLifetime()}async connect(e){let t=e.trim();if(!t)throw new Error("Paste a GitHub personal access token (classic).");let r=await h("/user",t);return this.persist(d({accessToken:t}),r),this.bridge.writeThrough(a,f(t,r),this.accountKey.current()),r}accessToken(){let e=this.token()?.accessToken;if(e)return e;let t=this.bridge.readThrough(a,this.accountKey.current());if(!t)return null;let r=O(t);return r?(this.persist(d({accessToken:r.accessToken}),r.user),r.accessToken):null}persist(e,t){localStorage.setItem(this.userKey,JSON.stringify(t)),localStorage.setItem(this.credentialsKey,JSON.stringify(e)),this.token.set(u(l({},e),{user:t})),this.user.set(t),this.connected.set(!0),this.needsFetch.set(!1)}async syncToVault(){let e=this.token();return e?this.bridge.writeThrough(a,f(e.accessToken,e.user),this.accountKey.current()):{kind:"skipped"}}reconcileVault(){let e=this.token();return T({local:e?f(e.accessToken,e.user):null,remote:this.bridge.readThrough(a,this.accountKey.current()),restore:t=>{let r=O(t);return r?(this.persist(d({accessToken:r.accessToken}),r.user),!0):!1},store:()=>this.syncToVault(),conflictMessage:"GitHub has different non-empty credentials here and in Mawkingbird; neither copy was replaced."})}expiresAt(){return G(this.token()?.connectedAt)}enforceLifetime(){let e=this.token();if(!e)return;let t=this.bridge.verdictFor(a,e.connectedAt);t.kind==="disconnect"?this.disconnect():t.kind==="lock"&&(this.forgetLocally(),this.needsFetch.set(!0))}async runProof(){let e=this.accessToken();if(!e)throw new Error("Connect GitHub first.");try{let[t,r]=await Promise.all([h("/notifications?all=false&participating=false&per_page=10",e),h("/user/following?per_page=10",e)]);this.notifications.set(t),this.following.set(r)}catch(t){throw t instanceof c&&t.status===401&&this.disconnect(),t}}async followedUsers(e=null){let t=await this.graphQl(E,e),r=t.data?.viewer?.following;if(!r)throw new Error(t.errors?.[0]?.message??"GitHub did not return followed accounts.");return{users:r.nodes,hasNextPage:r.pageInfo.hasNextPage,endCursor:r.pageInfo.endCursor}}async starredRepositoryOwners(e=null){let t=await this.graphQl(R,e),r=t.data?.viewer?.starredRepositories;if(!r)throw new Error(t.errors?.[0]?.message??"GitHub did not return your starred repositories.");let s=new Map;for(let i of r.nodes){let b=u(l({},i.owner),{bio:i.owner.bio??i.owner.description??null,socialAccounts:i.owner.socialAccounts??{nodes:[]}}),m=b.login.toLowerCase(),w=s.get(m),y={nameWithOwner:i.nameWithOwner,url:i.url,description:i.description};w?w.repositories.push(y):s.set(m,{profile:b,repositories:[y]})}return{owners:[...s.values()],repositoryCount:r.nodes.length,hasNextPage:r.pageInfo.hasNextPage,endCursor:r.pageInfo.endCursor}}disconnect(){this.bridge.removeThrough(a,this.accountKey.current()),this.forgetLocally(),this.connected.set(!1),this.needsFetch.set(!1)}forgetLocally(){localStorage.removeItem(this.userKey),localStorage.removeItem(this.credentialsKey),this.token.set(null),this.user.set(null),this.notifications.set(null),this.following.set(null)}async graphQl(e,t){let r=this.accessToken();if(!r)throw new Error("Connect GitHub first.");let s=await fetch(`${N}/graphql`,{method:"POST",headers:{Authorization:`Bearer ${r}`,Accept:"application/vnd.github+json","Content-Type":"application/json","X-GitHub-Api-Version":U},body:JSON.stringify({query:e,variables:{cursor:t}})});if(!s.ok)throw s.status===401&&this.disconnect(),new c(s.status,await x(s));return await s.json()}static \u0275fac=function(t){return new(t||n)};static \u0275prov=k({token:n,factory:n.\u0275fac,providedIn:"root"})},E=`
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
`,R=`
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
`,c=class extends Error{constructor(t,r){super(r);this.status=t}status};async function h(n,e){let t=await fetch(`${N}${n}`,{headers:{Authorization:`Bearer ${e}`,Accept:"application/vnd.github+json","X-GitHub-Api-Version":U}});if(!t.ok)throw new c(t.status,await x(t));return await t.json()}async function x(n){try{let e=await n.json();return n.status===401?"GitHub rejected that token. Check that it is active, then try again.":n.status===403&&e.message?.toLowerCase().includes("scope")?"That token is missing the notifications scope.":e.message??`GitHub returned HTTP ${n.status}.`}catch{return`GitHub returned HTTP ${n.status}.`}}function A(n,e){try{let t=JSON.parse(localStorage.getItem(n)??"null"),r=JSON.parse(localStorage.getItem(e)??"null");if(typeof r?.accessToken!="string"||!r.accessToken||typeof t?.login!="string")return localStorage.removeItem(n),localStorage.removeItem(e),null;let s=H(e,r);return u(l({},s),{user:t})}catch{return localStorage.removeItem(n),localStorage.removeItem(e),null}}function f(n,e){return JSON.stringify({accessToken:n,user:e})}function O(n){try{let e=JSON.parse(n);return typeof e?.accessToken!="string"||!e.accessToken||typeof e.user?.login!="string"||!e.user.login?null:{accessToken:e.accessToken,user:e.user}}catch{return null}}export{P as a};
