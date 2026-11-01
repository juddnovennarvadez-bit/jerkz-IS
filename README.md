# Jerks Inventory System

## Firebase setup

The Firebase Web SDK is configured in `src/firebase.js`. Local Firebase values
belong in `.env.local` (ignored by Git); use `.env.example` as the template.
Restart the Vite dev server after changing environment values.

The Firebase client exports:

- `auth` for Firebase Authentication
- `db` for Cloud Firestore
- `storage` for Firebase Storage
- `analyticsReady` for optional, browser-supported Analytics

To finish setup in the Firebase console:

1. Enable **Google** and **Email/Password** under **Authentication → Sign-in
   method**. Email/password accounts must verify their email before signing in.
2. Create a **Cloud Firestore** database.
3. Publish the rules in `firestore.rules` using **Firestore Database → Rules**
   in the Firebase Console. The initial Admin email in those rules must match
   `VITE_FIREBASE_ADMIN_EMAIL` in `.env.local`.
4. Add the initial Admin account in Firebase Authentication using that exact
   email, then sign in with Google or a verified email/password account.

The login screen supports Google sign-in and self-service email/password
accounts. Email/password signup asks for an email and username; the username
is stored as the Firebase Auth display name. Google accounts use their Google
profile name. Google passwords are managed by Google, not by this app.

The initial Admin can invite staff from **Users** by email. Accounts must be
email-verified and invited before Firestore grants access. Invited users may
then sign in with Google or an email/password account using the invited email.
Anyone may create an Authentication account, but uninvited accounts cannot
read or change the shared inventory. Firestore rules enforce staff approval
and access; do not replace them with open rules.

Inventory is stored as one shared Firestore document at
`inventory/shared`; changes sync to signed-in staff in real time. On the first
initialization only, the app imports the current browser's old inventory if
present, excludes legacy local user/password records, then removes that old
inventory key after the cloud write succeeds. If the cloud inventory already
exists, another browser's old local data is not imported or deleted. Back it
up before manually merging it. The current seed inventory is about 86 KB as
compact JSON; Firestore documents have a 1 MiB size limit, so this single-doc
design may need splitting as the inventory and transaction history grow.

The client also stores item images in the inventory document. Keep images
small; Firebase Storage integration is not yet implemented. Never put
service-account credentials in this frontend project.

Start the app with:

```bash
npm run dev
```

## Android and iOS apps with Capacitor

Capacitor configuration is in `capacitor.config.json` with the app ID
`com.jerks.inventory`. Install dependencies and generate/sync the Android
project with:

```bash
npm install
npx cap add android
npm run cap:sync
npm run cap:open:android
```

For iOS, run `npx cap add ios`, `npm run cap:sync`, and
`npm run cap:open:ios` on a Mac with Xcode installed. iOS apps must be built
and signed on macOS.

Before native Google sign-in can work, register `com.jerks.inventory` as an
Android and iOS app in Firebase. Download `google-services.json` into
`android/app/` and `GoogleService-Info.plist` into the iOS app target. These
files are excluded from Git. Enable Google sign-in in Firebase Authentication.
Add the Android debug/release signing SHA-1 fingerprints in Firebase, then
download an updated `google-services.json`. For iOS, add the
`REVERSED_CLIENT_ID` from `GoogleService-Info.plist` to the app target's URL
Types in Xcode. Capacitor's Android setup already enables the Google
authentication dependency.
Google sign-in in native builds uses the Capacitor Firebase Authentication
plugin; web builds keep using the Firebase popup flow.

The inventory editor uses the Capacitor Camera plugin on Android/iOS to take
photos with the rear camera. In Xcode, provide
`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, and
`NSPhotoLibraryAddUsageDescription` in the iOS app target's Info settings.
The photo is resized before it is embedded in the shared Firestore inventory.

## Building iOS with Codemagic

`codemagic.yaml` defines an `iOS TestFlight` workflow. It builds the web app,
syncs Capacitor plugins on a macOS builder, configures App Store signing,
builds an IPA, and uploads it to TestFlight.

Before starting the workflow:

1. Push this project, including `codemagic.yaml` and the generated `ios/`
   project, to a Git provider and add that repository in Codemagic.
2. Register `com.jerks.inventory` as an iOS app in Firebase and enable Google
   sign-in. In Codemagic, create an environment variable group named
   `ios_credentials`. Add `GOOGLE_SERVICE_INFO_PLIST` there as a **secure file**
   variable containing the downloaded `GoogleService-Info.plist`. The workflow
   installs it into the iOS target and adds its Google URL scheme during build.
3. Enroll in the Apple Developer Program and create the matching app record in
   App Store Connect. Create an App Store Connect API key with App Manager
   access. In Codemagic, add it as an App Store Connect integration named
   `JerksAppStoreConnect`.
4. In Codemagic **Code signing identities**, use that integration to create or
   fetch an App Store distribution certificate and provisioning profile for
   `com.jerks.inventory`.
5. Start the `iOS TestFlight` workflow. When processing completes, invite
   testers in App Store Connect or the TestFlight app.

Keep the `.p8` API key in Codemagic, not in this repository. The Firebase plist
is also injected by Codemagic and remains excluded from Git. iOS builds,
signing, and TestFlight distribution are handled by Codemagic's macOS runner;
they cannot be run locally on Windows.
