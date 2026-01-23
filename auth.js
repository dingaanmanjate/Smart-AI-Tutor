const poolData = {
    UserPoolId: 'af-south-1_LWPYqAkNt',
    ClientId: '5vpjebhijucjv6ld6cieglpupl',
    endpoint: undefined // Will be updated by sync-api.sh
};


const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);

let cognitoUser;
let currentRole = 'learner';

function setRole(role) {
    currentRole = role;

    // Update Button UI
    document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.getElementById(`role-${role}`);
    if (btn) btn.classList.add('active');

    // Update View Logic
    const signupPrompt = document.getElementById('signup-prompt');
    const tutorPrompt = document.getElementById('tutor-prompt');

    if (role === 'tutor') {
        // Tutors cannot sign up self-service
        if (signupPrompt) signupPrompt.style.display = 'none';
        if (tutorPrompt) tutorPrompt.style.display = 'block';

        // If we were on signup page, force back to login
        showLoginView();
    } else {
        // Learners can sign up
        if (signupPrompt) signupPrompt.style.display = 'block';
        if (tutorPrompt) tutorPrompt.style.display = 'none';
    }
}

function handleSignUp() {
    // Only Learners can sign up here
    if (currentRole !== 'learner') return;

    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    // Job title is automatically 'Learner' based on this flow
    const job = 'Learner';

    const attributeList = [
        new AmazonCognitoIdentity.CognitoUserAttribute({ Name: 'email', Value: email }),
        new AmazonCognitoIdentity.CognitoUserAttribute({ Name: 'custom:job_title', Value: job })
    ];

    userPool.signUp(email, password, attributeList, null, (err, result) => {
        if (err) return alert(err.message);
        cognitoUser = result.user; // Store user object for verification
        showVerifyView();
    });
}

function handleVerify() {
    const code = document.getElementById('verify-code').value;
    if (!cognitoUser) return alert("Session expired. Please try signing in.");

    cognitoUser.confirmRegistration(code, true, (err, result) => {
        if (err) return alert(err.message);
        alert("Email verified! You can now sign in.");
        showLoginView();
    });
}

function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const authDetails = new AmazonCognitoIdentity.AuthenticationDetails({ Username: email, Password: password });
    cognitoUser = new AmazonCognitoIdentity.CognitoUser({ Username: email, Pool: userPool });

    cognitoUser.setAuthenticationFlowType('USER_PASSWORD_AUTH');

    cognitoUser.authenticateUser(authDetails, {
        onSuccess: (result) => {
            console.log('Authentication successful.');

            // Fetch attributes to verify job_title
            cognitoUser.getUserAttributes((err, attributes) => {
                if (err) {
                    cognitoUser.signOut();
                    return alert("Error fetching user profile: " + err.message);
                }

                const jobAttribute = attributes.find(attr => attr.Name === 'custom:job_title');
                const userJob = jobAttribute ? jobAttribute.Value.toLowerCase() : '';
                const selectedJob = currentRole.toLowerCase();

                if (userJob !== selectedJob) {
                    console.error(`Access Denied`);
                    cognitoUser.signOut();
                    return alert(`Access Denied`);
                }

                console.log(`Verified`);
                if (window.checkUserSession) {
                    window.checkUserSession(); // Update UI without reload
                } else {
                    window.location.reload();
                }
            });
        },
        mfaSetup: (challengeName, challengeParameters) => {
            cognitoUser.associateSoftwareToken(this);
        },
        associateSecretCode: (secretCode) => {
            const loginView = document.getElementById('login-view');
            const mfaView = document.getElementById('mfa-view');
            const mfaSecret = document.getElementById('mfa-secret');
            if (loginView) loginView.style.display = 'none';
            if (mfaView) mfaView.style.display = 'block';
            if (mfaSecret) mfaSecret.innerText = secretCode;
        },
        onFailure: (err) => {
            if (err.code === 'UserNotConfirmedException') {
                alert("Account not verified.");
                showVerifyView();
            } else {
                alert(err.message);
            }
        }
    });
}

// UI toggle helpers
function showVerifyView() {
    const signupView = document.getElementById('signup-view');
    const loginView = document.getElementById('login-view');
    const verifyView = document.getElementById('verify-view');
    const title = document.getElementById('view-title');

    if (signupView) signupView.style.display = 'none';
    if (loginView) loginView.style.display = 'none';
    if (verifyView) verifyView.style.display = 'block';
    if (title) title.innerText = 'Verify Email';
}

function showSignupView(e) {
    if (e) e.preventDefault();
    if (currentRole === 'tutor') return; // Double check protection

    const signupView = document.getElementById('signup-view');
    const loginView = document.getElementById('login-view');
    const verifyView = document.getElementById('verify-view');
    const title = document.getElementById('view-title');

    if (signupView) signupView.style.display = 'block';
    if (loginView) loginView.style.display = 'none';
    if (verifyView) verifyView.style.display = 'none';
    if (title) title.innerText = 'Create Account';
}

function showLoginView(e) {
    if (e) e.preventDefault();
    const signupView = document.getElementById('signup-view');
    const loginView = document.getElementById('login-view');
    const verifyView = document.getElementById('verify-view');
    const title = document.getElementById('view-title');

    if (signupView) signupView.style.display = 'none';
    if (loginView) loginView.style.display = 'block';
    if (verifyView) verifyView.style.display = 'none';
    if (title) title.innerText = 'Welcome Back';
}

// Init
window.addEventListener('DOMContentLoaded', () => {
    // Default state
    setRole('learner');
});