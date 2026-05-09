import { component$, useStore, $, useVisibleTask$ } from "@builder.io/qwik";
import { useNavigate } from "@builder.io/qwik-city";
import { userPool } from "../lib/cognito";
import { AuthenticationDetails, CognitoUser, CognitoUserAttribute } from "amazon-cognito-identity-js";

export default component$(() => {
  const nav = useNavigate();
  const state = useStore({
    view: "login", // login, signup, verify
    role: "learner",
    email: "",
    password: "",
    verifyCode: "",
    loading: false,
  });

  // Check if already logged in
  useVisibleTask$(() => {
    const user = userPool.getCurrentUser();
    if (user) {
      user.getSession((err: any, session: any) => {
        if (!err && session.isValid()) {
          nav("/dashboard");
        }
      });
    }
  });

  const handleLogin = $(() => {
    state.loading = true;
    const authDetails = new AuthenticationDetails({
      Username: state.email,
      Password: state.password,
    });
    const cognitoUser = new CognitoUser({
      Username: state.email,
      Pool: userPool,
    });

    cognitoUser.setAuthenticationFlowType("USER_PASSWORD_AUTH");

    cognitoUser.authenticateUser(authDetails, {
      onSuccess: () => {
        console.log("Authentication successful.");
        cognitoUser.getUserAttributes((err, attributes) => {
          state.loading = false;
          if (err) {
            cognitoUser.signOut();
            alert("Error fetching user profile: " + err.message);
            return;
          }

          const jobAttribute = attributes?.find((attr) => attr.Name === "custom:job_title");
          const userJob = jobAttribute ? jobAttribute.Value.toLowerCase() : "";
          const selectedJob = state.role.toLowerCase();

          if (userJob !== selectedJob) {
            cognitoUser.signOut();
            alert(`Access Denied: You are registered as a ${userJob}, but trying to login as a ${selectedJob}.`);
            return;
          }

          nav("/dashboard");
        });
      },
      onFailure: (err) => {
        state.loading = false;
        if (err.code === "UserNotConfirmedException") {
          alert("Account not verified.");
          state.view = "verify";
        } else {
          alert(err.message);
        }
      },
    });
  });

  const handleSignUp = $(() => {
    if (state.role !== "learner") return;
    state.loading = true;

    const attributeList = [
      new CognitoUserAttribute({ Name: "email", Value: state.email }),
      new CognitoUserAttribute({ Name: "custom:job_title", Value: "Learner" }),
    ];

    userPool.signUp(state.email, state.password, attributeList, [], (err: any) => {
      state.loading = false;
      if (err) return alert(err.message);
      state.view = "verify";
    });
  });

  const handleVerify = $(() => {
    state.loading = true;
    const cognitoUser = new CognitoUser({
      Username: state.email,
      Pool: userPool,
    });

    cognitoUser.confirmRegistration(state.verifyCode, true, (err) => {
      state.loading = false;
      if (err) return alert(err.message);
      alert("Email verified! You can now sign in.");
      state.view = "login";
    });
  });

  return (
    <div id="auth-container">
      <h2 id="view-title">
        {state.view === "login" ? "Welcome Back" : state.view === "signup" ? "Create Account" : "Verify Email"}
      </h2>

      <div class="role-selector">
        <button
          class={`role-btn ${state.role === "learner" ? "active" : ""}`}
          onClick$={() => (state.role = "learner")}
        >
          Learner
        </button>
        <button
          class={`role-btn ${state.role === "tutor" ? "active" : ""}`}
          onClick$={() => {
            state.role = "tutor";
            state.view = "login";
          }}
        >
          Tutor
        </button>
      </div>

      {state.view === "login" && (
        <div id="login-view">
          <input
            type="email"
            placeholder="Email"
            value={state.email}
            onInput$={(e) => (state.email = (e.target as HTMLInputElement).value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={state.password}
            onInput$={(e) => (state.password = (e.target as HTMLInputElement).value)}
          />
          <button class="primary-btn" onClick$={handleLogin} disabled={state.loading}>
            {state.loading ? "Signing In..." : "Sign In"}
          </button>

          {state.role === "learner" ? (
            <div id="signup-prompt">
              <p class="toggle-line">
                New here?{" "}
                <a href="#" onClick$={() => (state.view = "signup")}>
                  Create Account
                </a>
              </p>
            </div>
          ) : (
            <div id="tutor-prompt">
              <p class="toggle-line">Contact admin.</p>
            </div>
          )}
        </div>
      )}

      {state.view === "signup" && state.role === "learner" && (
        <div id="signup-view">
          <input
            type="email"
            placeholder="Email"
            value={state.email}
            onInput$={(e) => (state.email = (e.target as HTMLInputElement).value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={state.password}
            onInput$={(e) => (state.password = (e.target as HTMLInputElement).value)}
          />
          <button class="primary-btn" onClick$={handleSignUp} disabled={state.loading}>
            {state.loading ? "Creating..." : "Create Learner Account"}
          </button>
          <p class="toggle-line">
            Already have an account?{" "}
            <a href="#" onClick$={() => (state.view = "login")}>
              Sign In
            </a>
          </p>
        </div>
      )}

      {state.view === "verify" && (
        <div id="verify-view">
          <p>Verification code sent to your email.</p>
          <input
            type="text"
            placeholder="6-digit code"
            value={state.verifyCode}
            onInput$={(e) => (state.verifyCode = (e.target as HTMLInputElement).value)}
          />
          <button class="primary-btn" onClick$={handleVerify} disabled={state.loading}>
            {state.loading ? "Verifying..." : "Confirm Email"}
          </button>
          <p class="toggle-line">
            <a href="#" onClick$={() => (state.view = "login")}>
              Back to Login
            </a>
          </p>
        </div>
      )}
    </div>
  );
});
