import{t as l}from"./chunk-C9ZLZfE4.js";import{$n as O$1,Dl as r,Jn as C$1,Mr as i,Ol as s,Os as Jo,Wt as e,ai as u,er as R$1,es as ze,hs as D,jc as ee,tr as V}from"./main-4O45FS3E.js";var E=`mockingbird_github_user`;var a=`mockingbird_github_credentials`;var h=`https://api.github.com`;var R=`2026-03-10`;var O=class s$1{bridge=D(C$1);native=D(u);accountKey=D(l);userKey=ze(E);credentialsKey=ze(a);token=Jo(_(this.userKey,this.credentialsKey));user=Jo(this.token()?.user??null);connected=Jo(this.token()!==null);notifications=Jo(null);following=Jo(null);needsFetch=Jo(!1);constructor(){this.native&&this.token()&&!e(this.token().accessToken)&&(this.forgetLocally(),this.connected.set(!1)),this.enforceLifetime()}async connect(e){let t=e.trim();if(!t)throw new Error(`Paste a GitHub personal access token (classic).`);if(this.native){let i=await this.native.connect(`github`,t);try{let n=await this.request(`/user`,i);return this.persist(R$1({accessToken:i}),n),n}catch(n){throw await this.native.forget(i),n}}let r=await this.request(`/user`,t);return this.persist(R$1({accessToken:t}),r),this.bridge.writeThrough(a,f(t,r),this.accountKey.current()),r}accessToken(){let e=this.token()?.accessToken;if(e)return e;if(this.native)return null;let t=this.bridge.readThrough(a,this.accountKey.current());if(!t)return null;let r=U(t);return r?(this.persist(R$1({accessToken:r.accessToken}),r.user),r.accessToken):null}persist(e,t){localStorage.setItem(this.userKey,JSON.stringify(t)),localStorage.setItem(this.credentialsKey,JSON.stringify(e)),this.token.set(s(r({},e),{user:t})),this.user.set(t),this.connected.set(!0),this.needsFetch.set(!1)}async syncToVault(){if(this.native)return{kind:`skipped`};let e=this.token();return e?this.bridge.writeThrough(a,f(e.accessToken,e.user),this.accountKey.current()):{kind:`skipped`}}reconcileVault(){if(this.native)return Promise.resolve({kind:`skipped`});let e=this.token();return i({local:e?f(e.accessToken,e.user):null,remote:this.bridge.readThrough(a,this.accountKey.current()),restore:t=>{let r=U(t);return r?(this.persist(R$1({accessToken:r.accessToken}),r.user),!0):!1},store:()=>this.syncToVault(),conflictMessage:`GitHub has different non-empty credentials here and in Mawkingbird; neither copy was replaced.`})}expiresAt(){return this.native?null:O$1(this.token()?.connectedAt)}enforceLifetime(){if(this.native)return;let e=this.token();if(!e)return;let t=this.bridge.verdictFor(a,e.connectedAt);t.kind===`disconnect`?this.disconnect():t.kind===`lock`&&(this.forgetLocally(),this.needsFetch.set(!0))}async runProof(){let e=this.accessToken();if(!e)throw new Error(`Connect GitHub first.`);try{let[t,r]=await Promise.all([this.request(`/notifications?all=false&participating=false&per_page=10`,e),this.request(`/user/following?per_page=10`,e)]);this.notifications.set(t),this.following.set(r)}catch(t){throw t instanceof c&&t.status===401&&(this.native||this.disconnect()),t}}async followedUsers(e=null){let t=await this.graphQl(C,e),r=t.data?.viewer?.following;if(!r)throw new Error(t.errors?.[0]?.message??`GitHub did not return followed accounts.`);return{users:r.nodes,hasNextPage:r.pageInfo.hasNextPage,endCursor:r.pageInfo.endCursor}}async starredRepositoryOwners(e=null){let t=await this.graphQl(A,e),r$1=t.data?.viewer?.starredRepositories;if(!r$1)throw new Error(t.errors?.[0]?.message??`GitHub did not return your starred repositories.`);let i=/* @__PURE__ */ new Map;for(let n of r$1.nodes){let b=s(r({},n.owner),{bio:n.owner.bio??n.owner.description??null,socialAccounts:n.owner.socialAccounts??{nodes:[]}}),m=b.login.toLowerCase(),w=i.get(m),y={nameWithOwner:n.nameWithOwner,url:n.url,description:n.description};w?w.repositories.push(y):i.set(m,{profile:b,repositories:[y]})}return{owners:[...i.values()],repositoryCount:r$1.nodes.length,hasNextPage:r$1.pageInfo.hasNextPage,endCursor:r$1.pageInfo.endCursor}}disconnect(){if(this.native)return this.disconnectNative();this.bridge.removeThrough(a,this.accountKey.current()),this.forgetLocally(),this.connected.set(!1),this.needsFetch.set(!1)}forgetLocally(){localStorage.removeItem(this.userKey),localStorage.removeItem(this.credentialsKey),this.token.set(null),this.user.set(null),this.notifications.set(null),this.following.set(null)}async disconnectNative(){let e=this.token()?.accessToken;e&&this.native&&await this.native.forget(e),this.forgetLocally(),this.connected.set(!1),this.needsFetch.set(!1)}async request(e,t){if(!this.native)return I(e,t);let r=await this.native.request({provider:`github`,handle:t,url:h+e,method:`GET`});if(r.status!==200)throw new c(r.status,`GitHub refused this read. Check the token and its permissions.`);return JSON.parse(r.body)}async graphQl(e,t){let r=this.accessToken();if(!r)throw new Error(`Connect GitHub first.`);if(this.native){let n=await this.native.request({provider:`github`,handle:r,url:h+`/graphql`,method:`POST`,body:{operation:e===C?`following`:`starred`,cursor:t}});if(n.status!==200)throw new c(n.status,`GitHub could not read this account list.`);return JSON.parse(n.body)}let i=await fetch(`${h}/graphql`,{method:`POST`,headers:{Authorization:`Bearer ${r}`,Accept:`application/vnd.github+json`,"Content-Type":`application/json`,"X-GitHub-Api-Version":R},body:JSON.stringify({query:e,variables:{cursor:t}})});if(!i.ok)throw i.status===401&&!this.native&&this.disconnect(),new c(i.status,await x(i));return await i.json()}static ɵfac=function(t){return new(t||s$1)};static ɵprov=ee({token:s$1,factory:s$1.ɵfac,providedIn:`root`})};var C=`
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
`;var A=`
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
`;var c=class extends Error{constructor(t,r){super(r);this.status=t}status};async function I(s,e){let t=await fetch(`${h}${s}`,{headers:{Authorization:`Bearer ${e}`,Accept:`application/vnd.github+json`,"X-GitHub-Api-Version":R}});if(!t.ok)throw new c(t.status,await x(t));return await t.json()}async function x(s){try{let e=await s.json();return s.status===401?`GitHub rejected that token. Check that it is active, then try again.`:s.status===403&&e.message?.toLowerCase().includes(`scope`)?`That token is missing the notifications scope.`:e.message??`GitHub returned HTTP ${s.status}.`}catch{return`GitHub returned HTTP ${s.status}.`}}function _(s$2,e){try{let t=JSON.parse(localStorage.getItem(s$2)??`null`),r$2=JSON.parse(localStorage.getItem(e)??`null`);if(typeof r$2?.accessToken!=`string`||!r$2.accessToken||typeof t?.login!=`string`)return localStorage.removeItem(s$2),localStorage.removeItem(e),null;let i=V(e,r$2);return s(r({},i),{user:t})}catch{return localStorage.removeItem(s$2),localStorage.removeItem(e),null}}function f(s,e){return JSON.stringify({accessToken:s,user:e})}function U(s){try{let e=JSON.parse(s);return typeof e?.accessToken!=`string`||!e.accessToken||typeof e.user?.login!=`string`||!e.user.login?null:{accessToken:e.accessToken,user:e.user}}catch{return null}}export{O as t};