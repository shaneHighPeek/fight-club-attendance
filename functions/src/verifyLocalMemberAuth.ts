import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const projectId = "fight-club-attendance-dev";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;

if (!authHost || !firestoreHost) {
  throw new Error("This verification may only run against local Firebase emulators.");
}

initializeApp({ projectId });
const auth = getAuth();
const db = getFirestore();

const adminEmail = "codex-admin-test@example.com";
const managerEmail = "codex-manager-test@example.com";
const memberEmail = "codex-password-test@example.com";
const adminPassword = "LocalAdmin-2026!";
const managerPassword = "LocalManager-2026!";
const initialPassword = "InitialLocal-2026!";
const selfChangedPassword = "SelfChanged-2026!";
const adminChangedPassword = "AdminChanged-2026!";
const memberId = "codex-nickname-verification";

async function authRequest(path: string, body: Record<string, unknown>) {
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/${path}?key=local-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Auth emulator request failed (${path}): ${JSON.stringify(result)}`);
  }
  return result;
}

async function signIn(email: string, password: string) {
  const result = await authRequest("accounts:signInWithPassword", {
    email,
    password,
    returnSecureToken: true
  });
  if (typeof result.idToken !== "string") {
    throw new Error(`Auth emulator did not return an ID token for ${email}.`);
  }
  return result.idToken;
}

async function deleteUserIfPresent(email: string) {
  try {
    const user = await auth.getUserByEmail(email);
    await auth.deleteUser(user.uid);
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") {
      throw error;
    }
  }
}

async function run() {
  await deleteUserIfPresent(adminEmail);
  await deleteUserIfPresent(managerEmail);
  await deleteUserIfPresent(memberEmail);
  await db.collection("members").doc(memberId).delete();

  const adminUser = await auth.createUser({ email: adminEmail, password: adminPassword });
  await auth.setCustomUserClaims(adminUser.uid, { role: "admin" });
  const managerUser = await auth.createUser({ email: managerEmail, password: managerPassword });
  await auth.setCustomUserClaims(managerUser.uid, { role: "manager" });
  const memberUser = await auth.createUser({ email: memberEmail, password: initialPassword });

  try {
    await db.collection("members").doc(memberId).set({
      firstName: "Nickname",
      lastName: "Verification",
      nickname: "Dojo Rocket",
      nicknameLower: "dojo rocket",
      status: "active",
      rank: { belt: "white", stripes: 0 },
      updatedAt: Timestamp.now()
    });
    const nicknameMatches = await db.collection("members")
      .orderBy("nicknameLower")
      .startAt("dojo")
      .endAt(`dojo\uf8ff`)
      .get();
    if (!nicknameMatches.docs.some((snapshot) => snapshot.id === memberId)) {
      throw new Error("Nickname prefix query did not return the test member.");
    }

    const managerToken = await signIn(managerEmail, managerPassword);
    const memberDocumentUrl = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/members/${memberId}`;
    const managerUpdateResponse = await fetch(
      `${memberDocumentUrl}?updateMask.fieldPaths=nickname&updateMask.fieldPaths=nicknameLower&updateMask.fieldPaths=status&updateMask.fieldPaths=updatedAt`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managerToken}`
        },
        body: JSON.stringify({
          fields: {
            nickname: { stringValue: "Dojo Comet" },
            nicknameLower: { stringValue: "dojo comet" },
            status: { stringValue: "pending" },
            updatedAt: { timestampValue: new Date().toISOString() }
          }
        })
      }
    );
    if (!managerUpdateResponse.ok) {
      throw new Error(`Manager nickname/status update was rejected: ${await managerUpdateResponse.text()}`);
    }
    const protectedUpdateResponse = await fetch(
      `${memberDocumentUrl}?updateMask.fieldPaths=email`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managerToken}`
        },
        body: JSON.stringify({ fields: { email: { stringValue: "not-allowed@example.com" } } })
      }
    );
    if (protectedUpdateResponse.ok) {
      throw new Error("Manager was incorrectly allowed to update a protected member field.");
    }

    const initialToken = await signIn(memberEmail, initialPassword);
    await authRequest("accounts:update", {
      idToken: initialToken,
      password: selfChangedPassword,
      returnSecureToken: true
    });
    await signIn(memberEmail, selfChangedPassword);

    await authRequest("accounts:sendOobCode", {
      requestType: "PASSWORD_RESET",
      email: memberEmail
    });

    const adminToken = await signIn(adminEmail, adminPassword);
    const callableResponse = await fetch(
      "http://127.0.0.1:5001/fight-club-attendance-dev/us-central1/setStaffPassword",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ data: { email: memberEmail, newPassword: adminChangedPassword } })
      }
    );
    const callableResult = await callableResponse.json() as Record<string, unknown>;
    if (!callableResponse.ok || !("result" in callableResult)) {
      throw new Error(`Admin password reset callable failed: ${JSON.stringify(callableResult)}`);
    }
    await signIn(memberEmail, adminChangedPassword);

    console.log("PASS nickname storage and prefix query");
    console.log("PASS manager nickname/status permissions and protected-field rejection");
    console.log("PASS forgot-password request");
    console.log("PASS signed-in user password change");
    console.log("PASS admin password reset callable");
  } finally {
    await db.collection("members").doc(memberId).delete();
    await auth.deleteUser(adminUser.uid).catch(() => undefined);
    await auth.deleteUser(managerUser.uid).catch(() => undefined);
    await auth.deleteUser(memberUser.uid).catch(() => undefined);
  }
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
