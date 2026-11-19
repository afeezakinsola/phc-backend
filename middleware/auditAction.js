const writeAuditLog = require("../utils/writeAuditLog");
const pendingAuditWrites = new Set();

// Track audit writes so automated tests can wait for them.
const trackAuditWrite = (promise) => {
  pendingAuditWrites.add(promise);

  const cleanup = () => {
    pendingAuditWrites.delete(promise);
  };

  promise.then(cleanup, cleanup);
};

// Wait until all pending audit writes have finished.
const waitForAuditWrites = async () => {
  while (pendingAuditWrites.size > 0) {
    await Promise.allSettled([...pendingAuditWrites]);
  }
};

const auditAction = (
  action,
  resourceType = "system",
  getResourceId = (req, res) =>
    req.params.id || res.locals.auditResourceId || null
) => {
  return (req, res, next) => {
    let recorded = false;

    const record = async (outcome) => {
      if (recorded) return;

      recorded = true;

      try {
        await writeAuditLog(req, {
          action,
          resourceType,
          resourceId: getResourceId(req, res),
          outcome,
        });
      } catch (error) {
        console.error("AUDIT_MIDDLEWARE_ERROR:", error.message);
      }
    };

    // Record the result after the controller sends its response.
    res.once("finish", () => {
      const outcome = res.statusCode < 400 ? "success" : "failure";

      const auditPromise = record(outcome);

      trackAuditWrite(auditPromise);
    });

    next();
  };
};

auditAction.waitForAuditWrites = waitForAuditWrites;

module.exports = auditAction;