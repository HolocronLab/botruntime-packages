"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupConfig = cleanupConfig;
function cleanupConfig(schema, rawConfig) {
    const config = {};
    for (const key in rawConfig) {
        if (key in schema) {
            const k = key;
            config[k] = rawConfig[k];
        }
    }
    return config;
}
//# sourceMappingURL=cleanup.js.map