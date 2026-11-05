# Shoot Guides

Client-facing shoot guides for This Way to Fabulous, hosted on one Netlify site with one folder per client. Clients just open a link, so nobody needs a Claude login.

```
public/
  index.html              ← bare landing page ("use the link Jessi sent you")
  assets/guide-submit.js  ← shared submit helper every guide loads
  rhcc/index.html         ← https://<site>/rhcc/
  home-care-cpas/index.html ← https://<site>/home-care-cpas/ (photos in img/)
netlify/functions/store.js ← saves submissions, emails via Resend, feeds the dashboard
```

## How submissions work

Each guide's forms post through `ShootGuide.submit(form)` (in `/assets/guide-submit.js`) to `/.netlify/functions/store`. That function:

1. **Saves** the submission to Netlify Blobs (store `shoot-guides`) first, so nothing is lost if an email fails.
2. **Emails** it through Resend from `NOTIFY_FROM` to `NOTIFY_TO`. The subject names the client, the form and who sent it, for example `RHCC shoot guide · Flag for discussion from Kristyn`.
3. **Feeds the TWTF Live Dashboard.** `{action:"list", adminCode}` returns every submission, using the same contract as the Wizards and Shoot With Purpose. The dashboard shows them in the **Client Shoot Guides** row.

The page shows its success message if the submission was saved or emailed. It shows the fallback message only if neither worked. Bots that fill the hidden `bot-field` honeypot are silently dropped.

## Environment variables (this site)

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | Your Resend API key |
| `NOTIFY_FROM` | `noreply@thiswaytofabulous.com` (verified in Resend). Never `onboarding@resend.dev`: the function refuses the sandbox sender. |
| `NOTIFY_TO` | `jessi@thiswaytofabulous.com` (comma-separate to add more) |
| `ADMIN_CODE` | Any long random string. Use the same value as `SHOOT_GUIDES_CODE` on the dashboard site. |

On the **submission-dashboard** site, add `SHOOT_GUIDES_URL` (this site's URL) and `SHOOT_GUIDES_CODE` (same as `ADMIN_CODE` above).

## Adding the next client

1. Drop the guide in `public/<client-slug>/index.html`, for example `public/home-care-cpas/index.html`.
2. In that page: load `<script src="/assets/guide-submit.js"></script>`, remove `data-netlify` from its forms, and swap the old Netlify Forms `fetch("/", …)` for `ShootGuide.submit(form).then(ok => …)`. Keep its own success and error messages.
3. Add the client to `CLIENTS` at the top of `netlify/functions/store.js`, using its display name and a subject label for each form name.
4. Push. Netlify redeploys and the guide is live at `/<client-slug>/`.
