const getStoredToken = function (eventID) {
    try {
        let editTokens = JSON.parse(localStorage.getItem("editTokens"));
        return editTokens[eventID];
    } catch (e) {
        localStorage.setItem("editTokens", JSON.stringify({}));
        return false;
    }
};

const addStoredToken = function (eventID, token) {
    try {
        let editTokens = JSON.parse(localStorage.getItem("editTokens"));
        editTokens[eventID] = token;
        localStorage.setItem("editTokens", JSON.stringify(editTokens));
    } catch (e) {
        localStorage.setItem(
            "editTokens",
            JSON.stringify({ [eventID]: token }),
        );
        return false;
    }
};

const removeStoredToken = function (eventID) {
    try {
        let editTokens = JSON.parse(localStorage.getItem("editTokens"));
        delete editTokens[eventID];
        localStorage.setItem("editTokens", JSON.stringify(editTokens));
    } catch (e) {
        localStorage.setItem("editTokens", JSON.stringify({}));
        return false;
    }
};

const getAdminSession = function() {
    try {
        const session = JSON.parse(localStorage.getItem("adminSession"));
        if (!session || !session.token || !session.email) return null;
        if (session.expiry && new Date(session.expiry) < new Date()) {
            localStorage.removeItem("adminSession");
            return null;
        }
        return session;
    } catch (e) {
        return null;
    }
};

const setAdminSession = function(token, email, expiry) {
    try {
        localStorage.setItem("adminSession", JSON.stringify({ token, email, expiry }));
    } catch (e) {}
};

const clearAdminSession = function() {
    try {
        localStorage.removeItem("adminSession");
    } catch (e) {}
};

const unexpectedError = [
    { message: "An unexpected error has occurred. Please try again later." },
];
