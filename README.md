# Chase Offers Auto-Add (Tampermonkey)

A Tampermonkey userscript that clicks the visible Chase offer buttons (Add, Activate, Claim, Enroll, or "+") once per page load on chase.com, so you don't have to add each offer by hand.

## Install

**One-click:** with Tampermonkey installed, open
[chase-offers.user.js (raw)](https://raw.githubusercontent.com/mobility22/chase-offers-tampermonkey/main/chase-offers.user.js)
and click **Install**.

**Or paste it in:** Tampermonkey menu → *Create a new script*, delete the template, paste the full contents of `chase-offers.user.js`, and save.

Then open your Chase offers page. A small blue panel at the bottom right shows how many offers were clicked.

## Auto-update

The script header sets `@updateURL` and `@downloadURL` to the raw file on `main`. Tampermonkey checks it periodically (or use *Check for userscript updates*) and installs any version with a higher `@version`.

## Safety limits

- Never logs in or touches sign-in forms. If the page is a sign-in page (login URL or a password/user ID field), it does nothing and shows a short note. Sign in to Chase yourself first.

- Waits 4 seconds after the page loads before starting.
- 1.5 seconds between clicks.
- On load, ticks the *Not added* offer-status filter (and unticks *Added to card*) if needed, then reads the "N results" count and clicks the first "+" offer button repeatedly, going back to the list if a click opens another view, until the count reaches 0 or it has clicked N times. The panel shows how many are left.
- At most 100 clicks per page load.
- Never clicks buttons whose text includes Remove, Added, Activated, Enrolled, Cancel, Sign out, Pay, Transfer, or Delete.
- **Stop / Start** button on the on-page panel.

## Disclaimer

Unofficial and not affiliated with JPMorgan Chase. Chase can change its page at any time, so if nothing is clicked, the button labels may have changed.
