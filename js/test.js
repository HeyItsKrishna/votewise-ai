// VoteWise AI - Test Suite
// Run using: node js/test.js

console.log("Running VoteWise Test Suite...\n");

// ---------- UTIL FUNCTIONS ----------

function sanitizeInput(input) {
  if (!input) return "";
  return input.replace(/[<>"']/g, "").trim();
}

function validateMessage(input) {
  if (!input) return false;
  const trimmed = input.trim();
  if (trimmed.length < 2) return false;
  if (trimmed.length > 500) return false;
  return true;
}

function detectVotingIntent(input) {
  const keywords = ["vote", "register", "poll", "election"];
  return keywords.some(k => input.toLowerCase().includes(k));
}

function rateLimiter(count, limit = 15) {
  return count <= limit;
}

// ---------- TEST RUNNER ----------

function test(name, fn) {
  try {
    fn();
    console.log("PASS:", name);
  } catch (err) {
    console.error("FAIL:", name);
    console.error(err.message);
  }
}

// ---------- TEST CASES ----------

test("Sanitize removes HTML", () => {
  const result = sanitizeInput("<script>alert(1)</script>");
  if (result.includes("<") || result.includes(">")) {
    throw new Error("HTML not removed");
  }
});

test("Sanitize trims whitespace", () => {
  const result = sanitizeInput("   vote   ");
  if (result !== "vote") {
    throw new Error("Trim failed");
  }
});

test("Valid message passes", () => {
  if (!validateMessage("How do I vote?")) {
    throw new Error("Valid message failed");
  }
});

test("Empty message fails", () => {
  if (validateMessage("")) {
    throw new Error("Empty message passed");
  }
});

test("Too short message fails", () => {
  if (validateMessage("a")) {
    throw new Error("Short message passed");
  }
});

test("Detects voting intent", () => {
  if (!detectVotingIntent("I want to vote")) {
    throw new Error("Intent not detected");
  }
});

test("Ignores unrelated text", () => {
  if (detectVotingIntent("Hello world")) {
    throw new Error("False positive intent");
  }
});

test("Within rate limit passes", () => {
  if (!rateLimiter(10)) {
    throw new Error("Valid rate blocked");
  }
});

test("Exceeding rate limit fails", () => {
  if (rateLimiter(20)) {
    throw new Error("Rate limit not enforced");
  }
});

console.log("\nAll tests executed.");
