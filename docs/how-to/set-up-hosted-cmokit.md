# Set up hosted CMOkit

This guide is for whoever runs hosted CMOkit (ADR-0016) on CMOkit's own Cloudflare account. It
covers each account to make, each value to copy, and where to enter it. Every name it uses is in the
[deployment reference](../reference/deployment.md).

You enter every key yourself. A key never goes in a chat, an email, an issue or a file in this
repository. GitHub keeps each one as an encrypted secret, and the deploy hands it to the Worker that
needs it (ADR-0008).

When you're done, there are three addresses:

- `https://auth.cmokit.ai`, the sign-in page (the issuer).
- `https://mcp.cmokit.ai/mcp`, the address people add to Claude (the content server).
- `https://app.cmokit.ai`, where people see their account (the content server's account page).

You set up no DNS for them. Each one is a Worker custom domain, so the first deploy creates its DNS
record and certificate in Cloudflare.

## Where values go

Every value goes into a GitHub environment named `production`, which only `main` can deploy from.
Make it once, first:

1. Open **cmokit/cmokit > Settings > Environments** and choose **New environment**. Name it
   `production`.
2. Under **Deployment branches and tags**, choose **Selected branches and tags**, then **Add
   deployment branch or tag rule**, and enter `main`.

Then enter each value on that environment's page, **Settings > Environments > production**:

- A **secret** goes under **Environment secrets**, with **Add environment secret**. Nobody can read
  it back, including you.
- A **variable** goes under **Environment variables**, with **Add environment variable**. Variables
  hold ids that aren't secret.

A value saved as a repository secret or variable also works, but then any workflow on any branch can
read it, so keep every value in the environment.

The name must match this guide exactly.

## 1. Cloudflare

1. In the Cloudflare dashboard, open **Workers & Pages**. Copy the **Account ID** from the right-hand
   side, and save it as the variable `CLOUDFLARE_ACCOUNT_ID`.
2. Open **My Profile > API Tokens > Create Token**, and use the **Edit Cloudflare Workers** template.
   Under **Account Resources**, pick your account. Under **Zone Resources**, pick `cmokit.ai`. Create
   the token and save it as the secret `CLOUDFLARE_API_TOKEN`.

The template's permissions are Workers scripts, routes, KV and R2. If the first deploy reports that
it can't add the custom domain, edit the token to add **Zone > DNS > Edit** for `cmokit.ai`. This
guide hasn't confirmed whether that permission is needed.

## 2. The content server's credential key

This key seals every customer's connected credentials, such as their event calendar's key. On a Mac,
open Terminal and run:

```
openssl rand -base64 32 | pbcopy
```

The command prints nothing and puts the key on your clipboard. Paste it as the secret
`CREDENTIAL_KEY`. Never change it afterwards: a new key means every customer has to connect again.

## 3. Sign in with Google

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project named
   CMOkit.
2. Open **Google Auth Platform**. Under **Branding**, enter the app name CMOkit and a support email,
   and leave the logo empty. Under **Audience**, choose **External**, then **Publish app**. CMOkit
   asks only for `openid`, `email` and `profile`, which need no review from Google (ADR-0018).
3. Under **Clients**, choose **Create client**, with the type **Web application**. Under **Authorized
   redirect URIs**, add exactly:

   ```
   https://auth.cmokit.ai/callback
   ```

4. Copy the **Client ID** and save it as the variable `GOOGLE_CLIENT_ID`. Copy the **Client secret**
   and save it as the secret `GOOGLE_CLIENT_SECRET`.

## 4. Sign in with GitHub

1. Make the app under the cmokit organization, so it doesn't hang off a personal account: open
   **github.com/organizations/cmokit/settings/applications**, then **OAuth Apps > New OAuth App**.
2. Enter the name CMOkit, the homepage URL `https://cmokit.ai`, and this **Authorization callback
   URL**:

   ```
   https://auth.cmokit.ai/callback
   ```

3. Register the app. Copy the **Client ID** and save it as the variable `GH_CLIENT_ID`. Choose
   **Generate a new client secret**, and save it as the secret `GH_CLIENT_SECRET`. GitHub doesn't
   allow names that start with `GITHUB_`, so these two start with `GH_`.

## 5. Sign in with Facebook

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps) and choose **Create
   app**. Pick the use case **Authenticate and request data from users with Facebook Login**.
2. In the app, open **Use cases > Facebook Login > Customize**. Add the `email` permission. Under
   **Settings**, add this to **Valid OAuth Redirect URIs**:

   ```
   https://auth.cmokit.ai/callback
   ```

3. Open **App settings > Basic**. Copy the **App ID** and save it as the variable `META_APP_ID`.
   Show the **App secret**, and save it as the secret `META_APP_SECRET`.
4. Meta asks for a privacy policy address before the app goes live. Enter the address of the privacy
   policy on cmokit.ai, then switch the app to **Live**.

## 6. Sign-in codes by email

Sign-in codes are sent through SendGrid (ADR-0015, ADR-0018), from `signin@cmokit.ai`. That address
needs no mailbox. You can skip this step, and the sign-in page then offers only Google, GitHub and
Facebook.

1. In SendGrid, open **Settings > Sender Authentication > Authenticate Your Domain**. Choose
   Cloudflare as the DNS host and enter `cmokit.ai`. SendGrid shows three DNS records. Add each one
   in Cloudflare under **cmokit.ai > DNS > Records**, with the proxy turned off, then choose
   **Verify** in SendGrid.
2. Open **Settings > API Keys > Create API Key**. Choose **Restricted Access**, set **Mail Send** to
   **Full Access**, and create the key. Save it as the secret `SENDGRID_API_KEY`.

## 7. Activate your own account

During the closed beta, a person gets in without paying when their email address is on hosted
CMOkit's list of activated addresses. Save the variable `ACTIVATED_EMAILS` with your own address.
For more than one, separate them with commas.

Use the address your sign-in proves: the primary email address on your GitHub account, or your Google
address. Facebook never counts, because CMOkit doesn't take its address as proven. The first time
you use CMOkit after signing in, you become CMOkit's customer: it makes your first brand, with you as
its only user. You can add more brands on your account page at `app.cmokit.ai`.

To let people in from CMOkit's own waitlist, open your account page, copy the slug after "Brand",
save it as the variable `WAITLIST_CUSTOMER`, and deploy again. Then, under Waitlist on your account
page, save your site's address, such as `https://cmokit.ai`, and paste the form the page gives you
into your site. Your account page lists everyone who joins, most referrals first, with an Activate
button for each. Activating someone lets them sign in and use CMOkit. CMOkit sends no email yet, so
tell them yourself.

To ask every user to accept the beta terms first, publish them, then save the variable `TERMS_URL`
with their address and `TERMS_VERSION` with their version, such as the date they were published.
When you change the terms, change the version, and everyone accepts again.

### Instagram on the waitlist

After joining, a person is offered Connect Instagram, and each of your recent Reels they comment on
moves them up (ADR-0045). Instagram reaches only business and creator accounts, so yours must be one.

1. At [developers.facebook.com/apps](https://developers.facebook.com/apps), choose **Create app**,
   with the type **Business**.
2. Add the **Instagram** product, and choose **API setup with Instagram login**.
3. Copy the **Instagram app ID** and save it as the variable `INSTAGRAM_APP_ID`. Show the
   **Instagram app secret**, and save it as the secret `INSTAGRAM_APP_SECRET`. These are not the
   Facebook Login app's `META_APP_ID` and `META_APP_SECRET`.
4. Under **Set up Instagram business login > Business login settings**, add this redirect URL:

   ```
   https://app.cmokit.ai/instagram/callback
   ```

5. Under **App roles > Roles**, add your brand's Instagram account, and anyone you want to test with,
   as **Instagram testers**. Each accepts the invite in Instagram under **Settings > Website
   permissions > Apps and websites**. Until Meta approves the app, only these accounts can connect.
6. Deploy again. On your account page, under Waitlist, choose **Connect Instagram** and sign in with
   your brand's account. Choose **Count comments on your Reels** whenever you want the list updated.
7. Before you open the waitlist to everyone, submit the app for App Review, asking for Advanced
   Access to `instagram_business_basic` and `instagram_business_manage_comments`. Meta asks for
   business verification and a privacy policy address first.

## 8. Deploy

Every merge to `main` deploys: GitHub runs **deploy-hosted**, which deploys the issuer, then the
content server. Its summary notes any sign-in way that's still off, and whether subscriptions are on.
Enter the values above before the first merge, or that run stops and names what's missing.

After you change a value above, open **Actions > deploy-hosted > Run workflow**, leave the branch on
`main`, and run it. It redeploys the two Workers and changes nothing else.

## 9. Subscriptions

Hosted CMOkit is billed by the lifecycle of CMOkit's own site (ADR-0017), so this part is set up in
that site's repository, the one made from the starter, not in this one. Do it in a Stripe sandbox
first, then again in live mode.

1. In Stripe, open **Product catalog > Add product**. Name it CMOkit and give it a recurring price.
   Copy the price's id, which starts with `price_`. In the site's `cmokit.config.ts`, add:

   ```ts
   subscription: { trialDays: 14, stripe: { price: 'price_...' } },
   ```

   with your price id and the trial length you want.
2. Open **Developers > API keys > Create restricted key**. Set **Checkout Sessions** to **Write**,
   **Customer portal** to **Write**, and **Subscriptions** to **Read**. Save the key as the secret
   `STRIPE_SECRET_KEY` in the site's repository. If a checkout later fails for want of a
   permission, Stripe's error names the one to add.
3. Open **Developers > Webhooks > Add destination**. Enter the endpoint
   `https://cmokit.ai/_cmokit/subscriptions/events`, and pick the events
   `customer.subscription.created`, `.updated`, `.deleted`, `.paused` and `.resumed`. Copy the
   **Signing secret** and save it as the secret `STRIPE_WEBHOOK_SECRET` in the site's repository.
4. Open **Settings > Billing > Customer portal** and turn the portal on.
5. In the site's `lifecycle/wrangler.jsonc`, turn on the `PRODUCT` line, which binds the content
   server's `Access` entrypoint, and keep the Worker's name `cmokit-site-lifecycle`, which the content
   server's binding names. Push, so the site deploys.
6. Run **deploy-hosted** here again. It finds the site's lifecycle and connects the content server to
   it, which turns subscriptions on.
