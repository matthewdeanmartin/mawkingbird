import{b as m,c as S,d,f as G}from"./chunk-NJKC5PDT.js";import{k as u}from"./chunk-HJAC43NC.js";import{R as w,ma as s}from"./chunk-L37VBGPQ.js";import{a as l,b as c}from"./chunk-7CGTOI24.js";var x="mockingbird_github_user",P="mockingbird_github_credentials",H="https://api.github.com",v="2026-03-10",y=class n{userKey=u(x);credentialsKey=u(P);token=s(N(this.userKey,this.credentialsKey));user=s(this.token()?.user??null);connected=s(this.token()!==null);notifications=s(null);following=s(null);async connect(t){let e=t.trim();if(!e)throw new Error("Paste a GitHub personal access token (classic).");let r=await g("/user",e),o=m({accessToken:e});localStorage.setItem(this.userKey,JSON.stringify(r)),localStorage.setItem(this.credentialsKey,JSON.stringify(o));let i=c(l({},o),{user:r});return this.token.set(i),this.user.set(r),this.connected.set(!0),r}expiresAt(){return S(this.token()?.connectedAt)}enforceLifetime(){let t=this.token();t&&d(t.connectedAt)&&this.disconnect()}async runProof(){let t=this.token()?.accessToken;if(!t)throw new Error("Connect GitHub first.");try{let[e,r]=await Promise.all([g("/notifications?all=false&participating=false&per_page=10",t),g("/user/following?per_page=10",t)]);this.notifications.set(e),this.following.set(r)}catch(e){throw e instanceof a&&e.status===401&&this.disconnect(),e}}async followedUsers(t=null){let e=await this.graphQl(C,t),r=e.data?.viewer?.following;if(!r)throw new Error(e.errors?.[0]?.message??"GitHub did not return followed accounts.");return{users:r.nodes,hasNextPage:r.pageInfo.hasNextPage,endCursor:r.pageInfo.endCursor}}async starredRepositoryOwners(t=null){let e=await this.graphQl(E,t),r=e.data?.viewer?.starredRepositories;if(!r)throw new Error(e.errors?.[0]?.message??"GitHub did not return your starred repositories.");let o=new Map;for(let i of r.nodes){let p=c(l({},i.owner),{bio:i.owner.bio??i.owner.description??null,socialAccounts:i.owner.socialAccounts??{nodes:[]}}),f=p.login.toLowerCase(),b=o.get(f),h={nameWithOwner:i.nameWithOwner,url:i.url,description:i.description};b?b.repositories.push(h):o.set(f,{profile:p,repositories:[h]})}return{owners:[...o.values()],repositoryCount:r.nodes.length,hasNextPage:r.pageInfo.hasNextPage,endCursor:r.pageInfo.endCursor}}disconnect(){localStorage.removeItem(this.userKey),localStorage.removeItem(this.credentialsKey),this.token.set(null),this.user.set(null),this.connected.set(!1),this.notifications.set(null),this.following.set(null)}async graphQl(t,e){let r=this.token()?.accessToken;if(!r)throw new Error("Connect GitHub first.");let o=await fetch(`${H}/graphql`,{method:"POST",headers:{Authorization:`Bearer ${r}`,Accept:"application/vnd.github+json","Content-Type":"application/json","X-GitHub-Api-Version":v},body:JSON.stringify({query:t,variables:{cursor:e}})});if(!o.ok)throw o.status===401&&this.disconnect(),new a(o.status,await k(o));return await o.json()}static \u0275fac=function(e){return new(e||n)};static \u0275prov=w({token:n,factory:n.\u0275fac,providedIn:"root"})},C=`
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
`,E=`
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
`,a=class extends Error{constructor(e,r){super(r);this.status=e}};async function g(n,t){let e=await fetch(`${H}${n}`,{headers:{Authorization:`Bearer ${t}`,Accept:"application/vnd.github+json","X-GitHub-Api-Version":v}});if(!e.ok)throw new a(e.status,await k(e));return await e.json()}async function k(n){try{let t=await n.json();return n.status===401?"GitHub rejected that token. Check that it is active, then try again.":n.status===403&&t.message?.toLowerCase().includes("scope")?"That token is missing the notifications scope.":t.message??`GitHub returned HTTP ${n.status}.`}catch{return`GitHub returned HTTP ${n.status}.`}}function N(n,t){try{let e=JSON.parse(localStorage.getItem(n)??"null"),r=JSON.parse(localStorage.getItem(t)??"null");if(typeof r?.accessToken!="string"||!r.accessToken||typeof e?.login!="string")return localStorage.removeItem(n),localStorage.removeItem(t),null;let o=G(t,r);return d(o.connectedAt)?(localStorage.removeItem(n),localStorage.removeItem(t),null):c(l({},o),{user:e})}catch{return localStorage.removeItem(n),localStorage.removeItem(t),null}}export{y as a};
