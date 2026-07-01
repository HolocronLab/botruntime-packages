"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AlreadyExistsError: () => AlreadyExistsError,
  AuthenticatedClient: () => AuthenticatedClient,
  BreakingChangesError: () => BreakingChangesError,
  ChatClientError: () => ChatClientError,
  ChatConfigError: () => ChatConfigError,
  ChatHTTPError: () => ChatHTTPError,
  Client: () => Client2,
  ForbiddenError: () => ForbiddenError,
  InternalError: () => InternalError,
  InvalidDataFormatError: () => InvalidDataFormatError,
  InvalidIdentifierError: () => InvalidIdentifierError,
  InvalidJsonSchemaError: () => InvalidJsonSchemaError,
  InvalidPayloadError: () => InvalidPayloadError,
  InvalidQueryError: () => InvalidQueryError,
  LimitExceededError: () => LimitExceededError,
  MethodNotFoundError: () => MethodNotFoundError,
  OperationTimeoutError: () => OperationTimeoutError,
  PayloadTooLargeError: () => PayloadTooLargeError,
  PaymentRequiredError: () => PaymentRequiredError,
  QuotaExceededError: () => QuotaExceededError,
  RateLimitedError: () => RateLimitedError,
  ReferenceConstraintError: () => ReferenceConstraintError,
  ReferenceNotFoundError: () => ReferenceNotFoundError,
  RelationConflictError: () => RelationConflictError,
  ResourceGoneError: () => ResourceGoneError,
  ResourceLockedConflictError: () => ResourceLockedConflictError,
  ResourceNotFoundError: () => ResourceNotFoundError,
  RuntimeError: () => RuntimeError,
  SignalListener: () => SignalListener,
  UnauthorizedError: () => UnauthorizedError,
  UnknownError: () => UnknownError,
  UnsupportedMediaTypeError: () => UnsupportedMediaTypeError,
  axios: () => axios4,
  errorFrom: () => errorFrom,
  isApiError: () => isApiError
});
module.exports = __toCommonJS(index_exports);
var axios4 = __toESM(require("axios"));

// src/errors.ts
var import_axios = __toESM(require("axios"));
var import_verror = require("verror");

// src/gen/client/errors.ts
var import_crypto = __toESM(require("crypto"));
var cryptoLibPolyfill = {
  // Fallback in case crypto isn't available.
  getRandomValues: (array) => new Uint8Array(array.map(() => Math.floor(Math.random() * 256)))
};
var cryptoLib = typeof window !== "undefined" && typeof window.document !== "undefined" ? window.crypto : import_crypto.default;
if (!cryptoLib.getRandomValues) {
  cryptoLib = cryptoLibPolyfill;
}
var BaseApiError = class _BaseApiError extends Error {
  constructor(code, description, type, message, error, id, metadata) {
    super(message);
    this.code = code;
    this.description = description;
    this.type = type;
    this.message = message;
    this.error = error;
    this.id = id;
    this.metadata = metadata;
    if (!this.id) {
      this.id = _BaseApiError.generateId();
    }
  }
  isApiError = true;
  format() {
    return `[${this.type}] ${this.message} (Error ID: ${this.id})`;
  }
  toJSON() {
    return {
      id: this.id,
      code: this.code,
      type: this.type,
      message: this.message,
      metadata: this.metadata
    };
  }
  static generateId() {
    const prefix = this.getPrefix();
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[\-:TZ]/g, "").split(".")[0];
    const randomSuffixByteLength = 4;
    const randomHexSuffix = Array.from(cryptoLib.getRandomValues(new Uint8Array(randomSuffixByteLength))).map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
    return `${prefix}_${timestamp}x${randomHexSuffix}`;
  }
  static getPrefix() {
    if (typeof window !== "undefined" && typeof window.document !== "undefined") {
      return "err_bwsr";
    }
    return "err";
  }
};
var isObject = (obj) => typeof obj === "object" && !Array.isArray(obj) && obj !== null;
var isApiError = (thrown) => {
  return thrown instanceof BaseApiError || isObject(thrown) && thrown.isApiError === true;
};
var UnknownError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(500, "An unknown error occurred", "Unknown", message, error, id, metadata);
  }
};
var InternalError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(500, "An internal error occurred", "Internal", message, error, id, metadata);
  }
};
var UnauthorizedError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(401, "The request requires to be authenticated.", "Unauthorized", message, error, id, metadata);
  }
};
var ForbiddenError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(403, "The requested action can't be peform by this resource.", "Forbidden", message, error, id, metadata);
  }
};
var PayloadTooLargeError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(413, "The request payload is too large.", "PayloadTooLarge", message, error, id, metadata);
  }
};
var InvalidPayloadError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(400, "The request payload is invalid.", "InvalidPayload", message, error, id, metadata);
  }
};
var UnsupportedMediaTypeError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(415, "The request is invalid because the content-type is not supported.", "UnsupportedMediaType", message, error, id, metadata);
  }
};
var MethodNotFoundError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(405, "The requested method does not exist.", "MethodNotFound", message, error, id, metadata);
  }
};
var ResourceNotFoundError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(404, "The requested resource does not exist.", "ResourceNotFound", message, error, id, metadata);
  }
};
var InvalidJsonSchemaError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(400, "The provided JSON schema is invalid.", "InvalidJsonSchema", message, error, id, metadata);
  }
};
var InvalidDataFormatError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(400, "The provided data doesn't respect the provided JSON schema.", "InvalidDataFormat", message, error, id, metadata);
  }
};
var InvalidIdentifierError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(400, "The provided identifier is not valid. An identifier must start with a lowercase letter, be between 2 and 100 characters long and use only alphanumeric characters.", "InvalidIdentifier", message, error, id, metadata);
  }
};
var RelationConflictError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(409, "The resource is related with a different resource that the one referenced in the request. This is usually caused when providing two resource identifiers that aren't linked together.", "RelationConflict", message, error, id, metadata);
  }
};
var ReferenceConstraintError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(409, "The resource cannot be deleted because it's referenced by another resource", "ReferenceConstraint", message, error, id, metadata);
  }
};
var ResourceLockedConflictError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(409, "The resource is current locked and cannot be operated on until the lock is released.", "ResourceLockedConflict", message, error, id, metadata);
  }
};
var ResourceGoneError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(410, "The requested resource is no longer available.", "ResourceGone", message, error, id, metadata);
  }
};
var ReferenceNotFoundError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(400, "The provided resource reference is missing. This is usually caused when providing an invalid id inside the payload of a request.", "ReferenceNotFound", message, error, id, metadata);
  }
};
var InvalidQueryError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(400, "The provided query is invalid. This is usually caused when providing an invalid parameter for querying a resource.", "InvalidQuery", message, error, id, metadata);
  }
};
var RuntimeError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(400, "An error happened during the execution of a runtime (bot or integration).", "Runtime", message, error, id, metadata);
  }
};
var AlreadyExistsError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(409, "The record attempted to be created already exists.", "AlreadyExists", message, error, id, metadata);
  }
};
var RateLimitedError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(429, "The request has been rate limited.", "RateLimited", message, error, id, metadata);
  }
};
var PaymentRequiredError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(402, "A payment is required to perform this request.", "PaymentRequired", message, error, id, metadata);
  }
};
var QuotaExceededError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(403, "The request exceeds the allowed quota. Quotas are a soft limit that can be increased.", "QuotaExceeded", message, error, id, metadata);
  }
};
var LimitExceededError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(413, "The request exceeds the allowed limit. Limits are a hard limit that cannot be increased.", "LimitExceeded", message, error, id, metadata);
  }
};
var BreakingChangesError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(400, "Request payload contains breaking changes which is not allowed for this resource without a version increment.", "BreakingChanges", message, error, id, metadata);
  }
};
var OperationTimeoutError = class extends BaseApiError {
  constructor(message, error, id, metadata) {
    super(504, "The operation timed out.", "OperationTimeout", message, error, id, metadata);
  }
};
var errorTypes = {
  Unknown: UnknownError,
  Internal: InternalError,
  Unauthorized: UnauthorizedError,
  Forbidden: ForbiddenError,
  PayloadTooLarge: PayloadTooLargeError,
  InvalidPayload: InvalidPayloadError,
  UnsupportedMediaType: UnsupportedMediaTypeError,
  MethodNotFound: MethodNotFoundError,
  ResourceNotFound: ResourceNotFoundError,
  InvalidJsonSchema: InvalidJsonSchemaError,
  InvalidDataFormat: InvalidDataFormatError,
  InvalidIdentifier: InvalidIdentifierError,
  RelationConflict: RelationConflictError,
  ReferenceConstraint: ReferenceConstraintError,
  ResourceLockedConflict: ResourceLockedConflictError,
  ResourceGone: ResourceGoneError,
  ReferenceNotFound: ReferenceNotFoundError,
  InvalidQuery: InvalidQueryError,
  Runtime: RuntimeError,
  AlreadyExists: AlreadyExistsError,
  RateLimited: RateLimitedError,
  PaymentRequired: PaymentRequiredError,
  QuotaExceeded: QuotaExceededError,
  LimitExceeded: LimitExceededError,
  BreakingChanges: BreakingChangesError,
  OperationTimeout: OperationTimeoutError
};
var errorFrom = (err) => {
  if (isApiError(err)) {
    return err;
  } else if (err instanceof Error) {
    return new UnknownError(err.message, err);
  } else if (typeof err === "string") {
    return new UnknownError(err);
  } else {
    return getApiErrorFromObject(err);
  }
};
function getApiErrorFromObject(err) {
  if (typeof err === "object" && "code" in err && "type" in err && "id" in err && "message" in err && typeof err.type === "string" && typeof err.message === "string") {
    const ErrorClass = errorTypes[err.type];
    if (!ErrorClass) {
      return new UnknownError(`An unclassified API error occurred: ${err.message} (Type: ${err.type}, Code: ${err.code})`);
    }
    return new ErrorClass(err.message, void 0, err.id || "UNKNOWN", err.metadata);
  }
  return new UnknownError("An invalid error occurred: " + JSON.stringify(err));
}

// src/errors.ts
var ChatClientError = class _ChatClientError extends import_verror.VError {
  static wrap(thrown, message) {
    const err = _ChatClientError.map(thrown);
    return new _ChatClientError(err, message ?? "");
  }
  static map(thrown) {
    if (thrown instanceof _ChatClientError) {
      return thrown;
    }
    if (import_axios.default.isAxiosError(thrown)) {
      return ChatHTTPError.fromAxios(thrown);
    }
    if (thrown instanceof Error) {
      const { message } = thrown;
      return new _ChatClientError(message);
    }
    return new _ChatClientError(String(thrown));
  }
  constructor(first, second) {
    if (typeof first === "string") {
      super(first);
      return;
    }
    super(first, second);
  }
};
var ChatHTTPError = class _ChatHTTPError extends ChatClientError {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
  static fromAxios(e) {
    const message = this._axiosMsg(e);
    return new _ChatHTTPError(e.response?.status, message);
  }
  static _axiosMsg(e) {
    let message = e.message;
    if (e.response?.statusText) {
      message += `
  ${e.response?.statusText}`;
    }
    if (e.response?.status && e.request?.method && e.request?.path) {
      message += `
  (${e.response?.status}) ${e.request.method} ${e.request.path}`;
    }
    if (e.response?.data?.message) {
      message += `
  ${e.response?.data?.message}`;
    }
    return message;
  }
};
var ChatConfigError = class extends ChatClientError {
  constructor(message) {
    super(message);
  }
};

// src/client.ts
var import_axios3 = __toESM(require("axios"));
var import_browser_or_node3 = require("browser-or-node");

// src/consts.ts
var defaultBaseApiUrl = "https://botruntime.ru";

// src/gen/client/index.ts
var import_axios2 = __toESM(require("axios"));

// src/gen/client/to-axios.ts
var import_qs = __toESM(require("qs"));
var isDefined = (pair) => pair[1] !== void 0;
var toAxiosRequest = (req) => {
  const { method, path, query, headers: headerParams, body } = req;
  const headerEntries = Object.entries(headerParams).filter(isDefined);
  const headers = Object.fromEntries(headerEntries);
  const queryString = import_qs.default.stringify(query, { encode: true, arrayFormat: "repeat", allowDots: true });
  const url = queryString ? [path, queryString].join("?") : path;
  const data = ["put", "post", "delete", "patch"].includes(method.toLowerCase()) ? body : void 0;
  return {
    method,
    url,
    headers,
    data
  };
};

// src/gen/client/operations/getConversation.ts
var parseReq = (input) => {
  return {
    path: `/conversations/${encodeURIComponent(input["id"])}`,
    headers: { "x-user-key": input["x-user-key"] },
    query: {},
    params: { "id": input["id"] },
    body: {}
  };
};

// src/gen/client/operations/createConversation.ts
var parseReq2 = (input) => {
  return {
    path: `/conversations`,
    headers: { "x-user-key": input["x-user-key"] },
    query: {},
    params: {},
    body: { "id": input["id"] }
  };
};

// src/gen/client/operations/getOrCreateConversation.ts
var parseReq3 = (input) => {
  return {
    path: `/conversations/get-or-create`,
    headers: { "x-user-key": input["x-user-key"] },
    query: {},
    params: {},
    body: { "id": input["id"] }
  };
};

// src/gen/client/operations/deleteConversation.ts
var parseReq4 = (input) => {
  return {
    path: `/conversations/${encodeURIComponent(input["id"])}`,
    headers: { "x-user-key": input["x-user-key"] },
    query: {},
    params: { "id": input["id"] },
    body: {}
  };
};

// src/gen/client/operations/listConversations.ts
var parseReq5 = (input) => {
  return {
    path: `/conversations`,
    headers: { "x-user-key": input["x-user-key"] },
    query: { "nextToken": input["nextToken"] },
    params: {},
    body: {}
  };
};

// src/gen/client/operations/listenConversation.ts
var parseReq6 = (input) => {
  return {
    path: `/conversations/${encodeURIComponent(input["id"])}/listen`,
    headers: { "x-user-key": input["x-user-key"] },
    query: {},
    params: { "id": input["id"] },
    body: {}
  };
};

// src/gen/client/operations/listMessages.ts
var parseReq7 = (input) => {
  return {
    path: `/conversations/${encodeURIComponent(input["conversationId"])}/messages`,
    headers: { "x-user-key": input["x-user-key"] },
    query: { "nextToken": input["nextToken"] },
    params: { "conversationId": input["conversationId"] },
    body: {}
  };
};

// src/gen/client/operations/addParticipant.ts
var parseReq8 = (input) => {
  return {
    path: `/conversations/${encodeURIComponent(input["conversationId"])}/participants`,
    headers: { "x-user-key": input["x-user-key"] },
    query: {},
    params: { "conversationId": input["conversationId"] },
    body: { "userId": input["userId"] }
  };
};

// src/gen/client/operations/removeParticipant.ts
var parseReq9 = (input) => {
  return {
    path: `/conversations/${encodeURIComponent(input["conversationId"])}/participants/${encodeURIComponent(input["userId"])}`,
    headers: { "x-user-key": input["x-user-key"] },
    query: {},
    params: { "conversationId": input["conversationId"], "userId": input["userId"] },
    body: {}
  };
};

// src/gen/client/operations/getParticipant.ts
var parseReq10 = (input) => {
  return {
    path: `/conversations/${encodeURIComponent(input["conversationId"])}/participants/${encodeURIComponent(input["userId"])}`,
    headers: { "x-user-key": input["x-user-key"] },
    query: {},
    params: { "conversationId": input["conversationId"], "userId": input["userId"] },
    body: {}
  };
};

// src/gen/client/operations/listParticipants.ts
var parseReq11 = (input) => {
  return {
    path: `/conversations/${encodeURIComponent(input["conversationId"])}/participants`,
    headers: { "x-user-key": input["x-user-key"] },
    query: { "nextToken": input["nextToken"] },
    params: { "conversationId": input["conversationId"] },
    body: {}
  };
};

// src/gen/client/operations/getMessage.ts
var parseReq12 = (input) => {
  return {
    path: `/messages/${encodeURIComponent(input["id"])}`,
    headers: { "x-user-key": input["x-user-key"] },
    query: {},
    params: { "id": input["id"] },
    body: {}
  };
};

// src/gen/client/operations/createMessage.ts
var parseReq13 = (input) => {
  return {
    path: `/messages`,
    headers: { "x-user-key": input["x-user-key"] },
    query: {},
    params: {},
    body: { "payload": input["payload"], "conversationId": input["conversationId"], "metadata": input["metadata"] }
  };
};

// src/gen/client/operations/deleteMessage.ts
var parseReq14 = (input) => {
  return {
    path: `/messages/${encodeURIComponent(input["id"])}`,
    headers: { "x-user-key": input["x-user-key"] },
    query: {},
    params: { "id": input["id"] },
    body: {}
  };
};

// src/gen/client/operations/getUser.ts
var parseReq15 = (input) => {
  return {
    path: `/users/me`,
    headers: { "x-user-key": input["x-user-key"] },
    query: {},
    params: {},
    body: {}
  };
};

// src/gen/client/operations/createUser.ts
var parseReq16 = (input) => {
  return {
    path: `/users`,
    headers: {},
    query: {},
    params: {},
    body: { "name": input["name"], "pictureUrl": input["pictureUrl"], "profile": input["profile"], "id": input["id"] }
  };
};

// src/gen/client/operations/getOrCreateUser.ts
var parseReq17 = (input) => {
  return {
    path: `/users/get-or-create`,
    headers: { "x-user-key": input["x-user-key"] },
    query: {},
    params: {},
    body: { "name": input["name"], "pictureUrl": input["pictureUrl"], "profile": input["profile"] }
  };
};

// src/gen/client/operations/updateUser.ts
var parseReq18 = (input) => {
  return {
    path: `/users/me`,
    headers: { "x-user-key": input["x-user-key"] },
    query: {},
    params: {},
    body: { "name": input["name"], "pictureUrl": input["pictureUrl"], "profile": input["profile"] }
  };
};

// src/gen/client/operations/deleteUser.ts
var parseReq19 = (input) => {
  return {
    path: `/users/me`,
    headers: { "x-user-key": input["x-user-key"] },
    query: {},
    params: {},
    body: {}
  };
};

// src/gen/client/operations/getEvent.ts
var parseReq20 = (input) => {
  return {
    path: `/events/${encodeURIComponent(input["id"])}`,
    headers: { "x-user-key": input["x-user-key"] },
    query: {},
    params: { "id": input["id"] },
    body: {}
  };
};

// src/gen/client/operations/createEvent.ts
var parseReq21 = (input) => {
  return {
    path: `/events`,
    headers: { "x-user-key": input["x-user-key"] },
    query: {},
    params: {},
    body: { "payload": input["payload"], "conversationId": input["conversationId"] }
  };
};

// src/gen/client/index.ts
var apiVersion = "0.7.6";
var Client = class {
  constructor(axiosInstance, props = {}) {
    this.axiosInstance = axiosInstance;
    this.props = props;
  }
  getConversation = async (input) => {
    const { path, headers, query, body } = parseReq(input);
    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest;
    const mapErrorResponse = this.props.toApiError ?? toApiError;
    const axiosReq = mapRequest({
      method: "get",
      path,
      headers: { ...headers },
      query: { ...query },
      body
    });
    return this.axiosInstance.request(axiosReq).then((res) => res.data).catch((e) => {
      throw mapErrorResponse(e);
    });
  };
  createConversation = async (input) => {
    const { path, headers, query, body } = parseReq2(input);
    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest;
    const mapErrorResponse = this.props.toApiError ?? toApiError;
    const axiosReq = mapRequest({
      method: "post",
      path,
      headers: { ...headers },
      query: { ...query },
      body
    });
    return this.axiosInstance.request(axiosReq).then((res) => res.data).catch((e) => {
      throw mapErrorResponse(e);
    });
  };
  getOrCreateConversation = async (input) => {
    const { path, headers, query, body } = parseReq3(input);
    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest;
    const mapErrorResponse = this.props.toApiError ?? toApiError;
    const axiosReq = mapRequest({
      method: "post",
      path,
      headers: { ...headers },
      query: { ...query },
      body
    });
    return this.axiosInstance.request(axiosReq).then((res) => res.data).catch((e) => {
      throw mapErrorResponse(e);
    });
  };
  deleteConversation = async (input) => {
    const { path, headers, query, body } = parseReq4(input);
    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest;
    const mapErrorResponse = this.props.toApiError ?? toApiError;
    const axiosReq = mapRequest({
      method: "delete",
      path,
      headers: { ...headers },
      query: { ...query },
      body
    });
    return this.axiosInstance.request(axiosReq).then((res) => res.data).catch((e) => {
      throw mapErrorResponse(e);
    });
  };
  listConversations = async (input) => {
    const { path, headers, query, body } = parseReq5(input);
    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest;
    const mapErrorResponse = this.props.toApiError ?? toApiError;
    const axiosReq = mapRequest({
      method: "get",
      path,
      headers: { ...headers },
      query: { ...query },
      body
    });
    return this.axiosInstance.request(axiosReq).then((res) => res.data).catch((e) => {
      throw mapErrorResponse(e);
    });
  };
  listenConversation = async (input) => {
    const { path, headers, query, body } = parseReq6(input);
    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest;
    const mapErrorResponse = this.props.toApiError ?? toApiError;
    const axiosReq = mapRequest({
      method: "get",
      path,
      headers: { ...headers },
      query: { ...query },
      body
    });
    return this.axiosInstance.request(axiosReq).then((res) => res.data).catch((e) => {
      throw mapErrorResponse(e);
    });
  };
  listMessages = async (input) => {
    const { path, headers, query, body } = parseReq7(input);
    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest;
    const mapErrorResponse = this.props.toApiError ?? toApiError;
    const axiosReq = mapRequest({
      method: "get",
      path,
      headers: { ...headers },
      query: { ...query },
      body
    });
    return this.axiosInstance.request(axiosReq).then((res) => res.data).catch((e) => {
      throw mapErrorResponse(e);
    });
  };
  addParticipant = async (input) => {
    const { path, headers, query, body } = parseReq8(input);
    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest;
    const mapErrorResponse = this.props.toApiError ?? toApiError;
    const axiosReq = mapRequest({
      method: "post",
      path,
      headers: { ...headers },
      query: { ...query },
      body
    });
    return this.axiosInstance.request(axiosReq).then((res) => res.data).catch((e) => {
      throw mapErrorResponse(e);
    });
  };
  removeParticipant = async (input) => {
    const { path, headers, query, body } = parseReq9(input);
    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest;
    const mapErrorResponse = this.props.toApiError ?? toApiError;
    const axiosReq = mapRequest({
      method: "delete",
      path,
      headers: { ...headers },
      query: { ...query },
      body
    });
    return this.axiosInstance.request(axiosReq).then((res) => res.data).catch((e) => {
      throw mapErrorResponse(e);
    });
  };
  getParticipant = async (input) => {
    const { path, headers, query, body } = parseReq10(input);
    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest;
    const mapErrorResponse = this.props.toApiError ?? toApiError;
    const axiosReq = mapRequest({
      method: "get",
      path,
      headers: { ...headers },
      query: { ...query },
      body
    });
    return this.axiosInstance.request(axiosReq).then((res) => res.data).catch((e) => {
      throw mapErrorResponse(e);
    });
  };
  listParticipants = async (input) => {
    const { path, headers, query, body } = parseReq11(input);
    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest;
    const mapErrorResponse = this.props.toApiError ?? toApiError;
    const axiosReq = mapRequest({
      method: "get",
      path,
      headers: { ...headers },
      query: { ...query },
      body
    });
    return this.axiosInstance.request(axiosReq).then((res) => res.data).catch((e) => {
      throw mapErrorResponse(e);
    });
  };
  getMessage = async (input) => {
    const { path, headers, query, body } = parseReq12(input);
    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest;
    const mapErrorResponse = this.props.toApiError ?? toApiError;
    const axiosReq = mapRequest({
      method: "get",
      path,
      headers: { ...headers },
      query: { ...query },
      body
    });
    return this.axiosInstance.request(axiosReq).then((res) => res.data).catch((e) => {
      throw mapErrorResponse(e);
    });
  };
  createMessage = async (input) => {
    const { path, headers, query, body } = parseReq13(input);
    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest;
    const mapErrorResponse = this.props.toApiError ?? toApiError;
    const axiosReq = mapRequest({
      method: "post",
      path,
      headers: { ...headers },
      query: { ...query },
      body
    });
    return this.axiosInstance.request(axiosReq).then((res) => res.data).catch((e) => {
      throw mapErrorResponse(e);
    });
  };
  deleteMessage = async (input) => {
    const { path, headers, query, body } = parseReq14(input);
    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest;
    const mapErrorResponse = this.props.toApiError ?? toApiError;
    const axiosReq = mapRequest({
      method: "delete",
      path,
      headers: { ...headers },
      query: { ...query },
      body
    });
    return this.axiosInstance.request(axiosReq).then((res) => res.data).catch((e) => {
      throw mapErrorResponse(e);
    });
  };
  getUser = async (input) => {
    const { path, headers, query, body } = parseReq15(input);
    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest;
    const mapErrorResponse = this.props.toApiError ?? toApiError;
    const axiosReq = mapRequest({
      method: "get",
      path,
      headers: { ...headers },
      query: { ...query },
      body
    });
    return this.axiosInstance.request(axiosReq).then((res) => res.data).catch((e) => {
      throw mapErrorResponse(e);
    });
  };
  createUser = async (input) => {
    const { path, headers, query, body } = parseReq16(input);
    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest;
    const mapErrorResponse = this.props.toApiError ?? toApiError;
    const axiosReq = mapRequest({
      method: "post",
      path,
      headers: { ...headers },
      query: { ...query },
      body
    });
    return this.axiosInstance.request(axiosReq).then((res) => res.data).catch((e) => {
      throw mapErrorResponse(e);
    });
  };
  getOrCreateUser = async (input) => {
    const { path, headers, query, body } = parseReq17(input);
    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest;
    const mapErrorResponse = this.props.toApiError ?? toApiError;
    const axiosReq = mapRequest({
      method: "post",
      path,
      headers: { ...headers },
      query: { ...query },
      body
    });
    return this.axiosInstance.request(axiosReq).then((res) => res.data).catch((e) => {
      throw mapErrorResponse(e);
    });
  };
  updateUser = async (input) => {
    const { path, headers, query, body } = parseReq18(input);
    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest;
    const mapErrorResponse = this.props.toApiError ?? toApiError;
    const axiosReq = mapRequest({
      method: "put",
      path,
      headers: { ...headers },
      query: { ...query },
      body
    });
    return this.axiosInstance.request(axiosReq).then((res) => res.data).catch((e) => {
      throw mapErrorResponse(e);
    });
  };
  deleteUser = async (input) => {
    const { path, headers, query, body } = parseReq19(input);
    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest;
    const mapErrorResponse = this.props.toApiError ?? toApiError;
    const axiosReq = mapRequest({
      method: "delete",
      path,
      headers: { ...headers },
      query: { ...query },
      body
    });
    return this.axiosInstance.request(axiosReq).then((res) => res.data).catch((e) => {
      throw mapErrorResponse(e);
    });
  };
  getEvent = async (input) => {
    const { path, headers, query, body } = parseReq20(input);
    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest;
    const mapErrorResponse = this.props.toApiError ?? toApiError;
    const axiosReq = mapRequest({
      method: "get",
      path,
      headers: { ...headers },
      query: { ...query },
      body
    });
    return this.axiosInstance.request(axiosReq).then((res) => res.data).catch((e) => {
      throw mapErrorResponse(e);
    });
  };
  createEvent = async (input) => {
    const { path, headers, query, body } = parseReq21(input);
    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest;
    const mapErrorResponse = this.props.toApiError ?? toApiError;
    const axiosReq = mapRequest({
      method: "post",
      path,
      headers: { ...headers },
      query: { ...query },
      body
    });
    return this.axiosInstance.request(axiosReq).then((res) => res.data).catch((e) => {
      throw mapErrorResponse(e);
    });
  };
};
function toApiError(err) {
  if (import_axios2.default.isAxiosError(err) && err.response?.data) {
    return errorFrom(err.response.data);
  }
  return errorFrom(err);
}

// src/jsonwebtoken.ts
var import_browser_or_node = require("browser-or-node");
var requireJwt = () => require("jsonwebtoken");
var packageModule = import_browser_or_node.isBrowser ? null : requireJwt();
var jsonwebtoken_default = packageModule;

// src/listing.ts
var AsyncCollection = class {
  constructor(_list) {
    this._list = _list;
  }
  async *[Symbol.asyncIterator]() {
    let nextToken;
    do {
      const { items, meta } = await this._list({ nextToken });
      nextToken = meta.nextToken;
      for (const item of items) {
        yield item;
      }
    } while (nextToken);
  }
  async collect(props = {}) {
    const limit = props.limit ?? Number.POSITIVE_INFINITY;
    const arr = [];
    let count = 0;
    for await (const item of this) {
      arr.push(item);
      count++;
      if (count >= limit) {
        break;
      }
    }
    return arr;
  }
};

// src/event-emitter.ts
var EventEmitter = class {
  _listeners = {};
  emit(type, event) {
    const listeners = this._listeners[type];
    if (!listeners) {
      return;
    }
    for (const listener of [...listeners]) {
      listener(event);
    }
  }
  onceOrMore(type, listener) {
    const wrapped = (event) => {
      const status = listener(event);
      if (status === "stop-listening") {
        this.off(type, wrapped);
      }
    };
    this.on(type, wrapped);
  }
  once(type, listener) {
    const wrapped = (event) => {
      this.off(type, wrapped);
      listener(event);
    };
    this.on(type, wrapped);
  }
  on(type, listener) {
    if (!this._listeners[type]) {
      this._listeners[type] = [];
    }
    this._listeners[type].push(listener);
  }
  off(type, listener) {
    const listeners = this._listeners[type];
    if (!listeners) {
      return;
    }
    const index = listeners.indexOf(listener);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  }
  cleanup() {
    this._listeners = {};
  }
};

// src/eventsource.ts
var import_browser_or_node2 = require("browser-or-node");
var makeEventSource = (url, props = {}) => {
  if (import_browser_or_node2.isBrowser) {
    const module2 = require("event-source-polyfill");
    const ctor = module2.EventSourcePolyfill;
    const source = new ctor(url, { headers: props.headers });
    const emitter = new EventEmitter();
    source.onopen = (ev) => emitter.emit("open", ev);
    source.onmessage = (ev) => emitter.emit("message", ev);
    source.onerror = (ev) => emitter.emit("error", ev);
    return {
      emitter,
      source
    };
  } else {
    const module2 = require("eventsource");
    const source = new module2(url, { headers: props.headers });
    const emitter = new EventEmitter();
    source.onopen = (ev) => emitter.emit("open", ev);
    source.onmessage = (ev) => emitter.emit("message", ev);
    source.onerror = (ev) => emitter.emit("error", ev);
    return {
      emitter,
      source
    };
  }
};
var listenEventSource = async (url, props = {}) => {
  const { emitter, source } = makeEventSource(url, props);
  await new Promise((resolve, reject) => {
    emitter.on("open", () => {
      resolve();
    });
    emitter.on("error", (thrown) => {
      reject(thrown);
    });
  }).finally(() => emitter.cleanup());
  return {
    on: emitter.on.bind(emitter),
    close: () => {
      emitter.cleanup();
      source.close();
    }
  };
};

// src/gen/signals/messageCreated.z.ts
var import_zod = require("zod");
var messageCreated_z_default = import_zod.z.object({
  type: import_zod.z.literal("message_created"),
  data: import_zod.z.object({
    id: import_zod.z.string().describe("Identifier of the [Message](#schema_message)"),
    createdAt: import_zod.z.string().datetime().describe(
      "Creation date of the [Message](#schema_message) in ISO 8601 format"
    ),
    payload: import_zod.z.union([
      import_zod.z.object({ type: import_zod.z.literal("audio"), audioUrl: import_zod.z.string().min(1) }),
      import_zod.z.object({
        type: import_zod.z.literal("card"),
        title: import_zod.z.string().min(1),
        subtitle: import_zod.z.string().min(1).optional(),
        imageUrl: import_zod.z.string().min(1).optional(),
        actions: import_zod.z.array(
          import_zod.z.object({
            action: import_zod.z.enum(["postback", "url", "say"]),
            label: import_zod.z.string().min(1),
            value: import_zod.z.string().min(1)
          })
        )
      }),
      import_zod.z.object({
        type: import_zod.z.literal("carousel"),
        items: import_zod.z.array(
          import_zod.z.object({
            type: import_zod.z.literal("card"),
            title: import_zod.z.string().min(1),
            subtitle: import_zod.z.string().min(1).optional(),
            imageUrl: import_zod.z.string().min(1).optional(),
            actions: import_zod.z.array(
              import_zod.z.object({
                action: import_zod.z.enum(["postback", "url", "say"]),
                label: import_zod.z.string().min(1),
                value: import_zod.z.string().min(1)
              })
            )
          })
        )
      }),
      import_zod.z.object({
        text: import_zod.z.string().min(1),
        options: import_zod.z.array(
          import_zod.z.object({ label: import_zod.z.string().min(1), value: import_zod.z.string().min(1) })
        ),
        type: import_zod.z.literal("choice")
      }),
      import_zod.z.object({
        text: import_zod.z.string().min(1),
        options: import_zod.z.array(
          import_zod.z.object({ label: import_zod.z.string().min(1), value: import_zod.z.string().min(1) })
        ),
        type: import_zod.z.literal("dropdown")
      }),
      import_zod.z.object({
        type: import_zod.z.literal("file"),
        fileUrl: import_zod.z.string().min(1),
        title: import_zod.z.string().min(1).optional()
      }),
      import_zod.z.object({ type: import_zod.z.literal("image"), imageUrl: import_zod.z.string().min(1) }),
      import_zod.z.object({
        type: import_zod.z.literal("location"),
        latitude: import_zod.z.number(),
        longitude: import_zod.z.number(),
        address: import_zod.z.string().optional(),
        title: import_zod.z.string().optional()
      }),
      import_zod.z.object({ type: import_zod.z.literal("text"), text: import_zod.z.string().min(1) }),
      import_zod.z.object({ type: import_zod.z.literal("video"), videoUrl: import_zod.z.string().min(1) }),
      import_zod.z.object({
        type: import_zod.z.literal("markdown"),
        markdown: import_zod.z.string().min(1)
      }),
      import_zod.z.object({
        type: import_zod.z.literal("bloc"),
        items: import_zod.z.array(
          import_zod.z.union([
            import_zod.z.object({
              type: import_zod.z.literal("text"),
              text: import_zod.z.string().min(1)
            }),
            import_zod.z.object({
              type: import_zod.z.literal("markdown"),
              markdown: import_zod.z.string().min(1)
            }),
            import_zod.z.object({
              type: import_zod.z.literal("image"),
              imageUrl: import_zod.z.string().min(1)
            }),
            import_zod.z.object({
              type: import_zod.z.literal("audio"),
              audioUrl: import_zod.z.string().min(1)
            }),
            import_zod.z.object({
              type: import_zod.z.literal("video"),
              videoUrl: import_zod.z.string().min(1)
            }),
            import_zod.z.object({
              type: import_zod.z.literal("file"),
              fileUrl: import_zod.z.string().min(1),
              title: import_zod.z.string().min(1).optional()
            }),
            import_zod.z.object({
              type: import_zod.z.literal("location"),
              latitude: import_zod.z.number(),
              longitude: import_zod.z.number(),
              address: import_zod.z.string().optional(),
              title: import_zod.z.string().optional()
            })
          ])
        )
      })
    ]).describe("Payload is the content type of the message."),
    userId: import_zod.z.string().describe("ID of the [User](#schema_user)"),
    conversationId: import_zod.z.string().describe("ID of the [Conversation](#schema_conversation)"),
    metadata: import_zod.z.record(import_zod.z.union([import_zod.z.any(), import_zod.z.null()])).describe("Metadata of the message").optional(),
    isBot: import_zod.z.boolean().describe("Whether the message was created by the bot or not")
  })
});

// src/gen/signals/eventCreated.z.ts
var import_zod2 = require("zod");
var eventCreated_z_default = import_zod2.z.object({
  type: import_zod2.z.literal("event_created"),
  data: import_zod2.z.object({
    createdAt: import_zod2.z.string().datetime().describe(
      "Creation date of the custom [Event](#schema_event) in ISO 8601 format"
    ),
    payload: import_zod2.z.record(import_zod2.z.any()).describe("Payload is the content of the custom event."),
    conversationId: import_zod2.z.string().describe("ID of the [Conversation](#schema_conversation)."),
    userId: import_zod2.z.string().describe("ID of the [User](#schema_user)."),
    id: import_zod2.z.union([import_zod2.z.string(), import_zod2.z.null()]),
    isBot: import_zod2.z.boolean().describe("Whether the event was created by the bot or not")
  })
});

// src/gen/signals/participantAdded.z.ts
var import_zod3 = require("zod");
var participantAdded_z_default = import_zod3.z.object({
  type: import_zod3.z.literal("participant_added"),
  data: import_zod3.z.object({ conversationId: import_zod3.z.string(), participantId: import_zod3.z.string() })
});

// src/gen/signals/participantRemoved.z.ts
var import_zod4 = require("zod");
var participantRemoved_z_default = import_zod4.z.object({
  type: import_zod4.z.literal("participant_removed"),
  data: import_zod4.z.object({ conversationId: import_zod4.z.string(), participantId: import_zod4.z.string() })
});

// src/gen/signals/messageDeleted.z.ts
var import_zod5 = require("zod");
var messageDeleted_z_default = import_zod5.z.object({
  type: import_zod5.z.literal("message_deleted"),
  data: import_zod5.z.object({
    id: import_zod5.z.string(),
    conversationId: import_zod5.z.string(),
    userId: import_zod5.z.string()
  })
});

// src/gen/signals/index.ts
var zod = {
  messageCreated: messageCreated_z_default,
  eventCreated: eventCreated_z_default,
  participantAdded: participantAdded_z_default,
  participantRemoved: participantRemoved_z_default,
  messageDeleted: messageDeleted_z_default
};

// src/watchdog.ts
var WatchDog = class _WatchDog {
  constructor(_ms) {
    this._ms = _ms;
  }
  _listeners = [];
  _handle = null;
  static init = (ms) => {
    const inst = new _WatchDog(ms);
    inst.reset();
    return inst;
  };
  reset() {
    if (this._handle) {
      clearTimeout(this._handle);
    }
    this._handle = setTimeout(() => {
      this._emitError(new Error("Client connection timed out"));
    }, this._ms);
  }
  on(_type, listener) {
    this._listeners.push(listener);
  }
  close() {
    if (this._handle) {
      clearTimeout(this._handle);
    }
    this._listeners = [];
  }
  _emitError(error) {
    for (const listener of this._listeners) {
      listener(error);
    }
  }
};

// src/signal-listener.ts
var CONNECTION_TIMEOUT = 6e4;
var DEFAULT_ERROR_MESSAGE = "unknown error";
var SignalListener = class _SignalListener extends EventEmitter {
  constructor(_props) {
    super();
    this._props = _props;
  }
  _state = { status: "disconnected" };
  static listen = async (props) => {
    const inst = new _SignalListener(props);
    await inst.connect();
    return inst;
  };
  get status() {
    return this._state.status;
  }
  connect = async () => {
    if (this._state.status === "connected") {
      return;
    }
    if (this._state.status === "connecting") {
      await this._state.connectionPromise;
      return;
    }
    const connectionPromise = this._connect();
    this._state = { status: "connecting", connectionPromise };
    await connectionPromise;
  };
  disconnect = async () => {
    if (this._state.status === "disconnected") {
      return;
    }
    let source;
    let watchdog;
    if (this._state.status === "connecting") {
      source = await this._state.connectionPromise;
    } else {
      source = this._state.source;
      watchdog = this._state.watchdog;
    }
    this._disconnectSync(source, watchdog);
  };
  _connect = async () => {
    const source = await listenEventSource(`${this._props.url}/conversations/${this._props.conversationId}/listen`, {
      headers: { "x-user-key": this._props.userKey }
    });
    const watchdog = WatchDog.init(CONNECTION_TIMEOUT);
    source.on("message", this._handleMessage(source, watchdog));
    source.on("error", this._handleError(source, watchdog));
    watchdog.on("error", this._handleError(source, watchdog));
    this._state = { status: "connected", source, watchdog };
    return source;
  };
  _disconnectSync = (source, watchdog) => {
    source.close();
    watchdog?.close();
    this._state = { status: "disconnected" };
  };
  _handleMessage = (_source, watchdog) => (ev) => {
    watchdog.reset();
    const signal = this._parseSignal(ev.data);
    this.emit(signal.type, signal.data);
  };
  _handleError = (source, watchdog) => (ev) => {
    this._disconnectSync(source, watchdog);
    const err = this._toError(ev);
    this.emit("error", err);
  };
  _parseSignal = (data) => {
    for (const [schemaName, schema] of Object.entries(zod)) {
      this._debug("trying to parse", schemaName);
      const parsedData = this._safeJsonParse(data);
      const parseResult = schema.safeParse(parsedData);
      if (parseResult.success) {
        this._debug("parsing successfull", schemaName, parseResult.data);
        return parseResult.data;
      }
    }
    return {
      type: "unknown",
      data
    };
  };
  _safeJsonParse = (x) => {
    try {
      return JSON.parse(x);
    } catch {
      return x;
    }
  };
  _toError = (thrown) => {
    if (thrown instanceof Error) {
      return thrown;
    }
    if (typeof thrown === "string") {
      return new Error(thrown);
    }
    if (thrown === null) {
      return new Error(DEFAULT_ERROR_MESSAGE);
    }
    if (typeof thrown === "object" && "message" in thrown) {
      return this._toError(thrown.message);
    }
    try {
      const json = JSON.stringify(thrown);
      return new Error(json);
    } catch {
      return new Error(DEFAULT_ERROR_MESSAGE);
    }
  };
  _debug = (...args) => {
    if (!this._props.debug) {
      return;
    }
    console.info(...args);
  };
};

// src/client.ts
var _100mb = 100 * 1024 * 1024;
var maxBodyLength = _100mb;
var maxContentLength = _100mb;
var defaultTimeout = 6e4;
var _createAuthClient = Symbol("_createAuthClient");
var Client2 = class _Client {
  constructor(props) {
    this.props = props;
    const axiosClient = _Client._createAxios(props);
    this._auto = new Client(axiosClient);
  }
  _connectionTested = false;
  _auto;
  get apiVersion() {
    return apiVersion;
  }
  /**
   * Gets or creates a user based on the provided props and returns an authenticated client.
   */
  static async connect(props) {
    const { userId, userKey, encryptionKey, ...clientProps } = props;
    const client = new _Client(clientProps);
    await client._testConnection();
    if (userKey) {
      const { user: user2 } = await client.getOrCreateUser({ "x-user-key": userKey });
      return AuthenticatedClient[_createAuthClient](client, { ...user2, key: userKey });
    }
    if (encryptionKey) {
      if (!jsonwebtoken_default) {
        const message = "Connecting with an encryption key is not supported in the browser; use in NodeJs or format the key manually with jsonwebtoken.";
        throw new ChatConfigError(message);
      }
      if (!userId) {
        throw new ChatConfigError(
          "userId is required when connecting with an encryption key. You may pick any userId of your choice that is not already taken by another user."
        );
      }
      const userKey2 = jsonwebtoken_default.sign({ id: userId }, encryptionKey, { algorithm: "HS256" });
      const { user: user2 } = await client.getOrCreateUser({ "x-user-key": userKey2 });
      return AuthenticatedClient[_createAuthClient](client, { ...user2, key: userKey2 });
    }
    const { user, key } = await client.createUser({ id: userId });
    return AuthenticatedClient[_createAuthClient](client, { ...user, key });
  }
  createConversation = (x) => this._call("createConversation", x);
  getConversation = (x) => this._call("getConversation", x);
  getOrCreateConversation = (x) => this._call("getOrCreateConversation", x);
  deleteConversation = (x) => this._call("deleteConversation", x);
  listConversations = (x) => this._call("listConversations", x);
  listMessages = (x) => this._call("listMessages", x);
  addParticipant = (x) => this._call("addParticipant", x);
  removeParticipant = (x) => this._call("removeParticipant", x);
  getParticipant = (x) => this._call("getParticipant", x);
  listParticipants = (x) => this._call("listParticipants", x);
  createMessage = (x) => this._call("createMessage", x);
  getMessage = (x) => this._call("getMessage", x);
  deleteMessage = (x) => this._call("deleteMessage", x);
  createUser = (x) => this._call("createUser", x);
  getUser = (x) => this._call("getUser", x);
  getOrCreateUser = (x) => this._call("getOrCreateUser", x);
  updateUser = (x) => this._call("updateUser", x);
  deleteUser = (x) => this._call("deleteUser", x);
  createEvent = (x) => this._call("createEvent", x);
  getEvent = (x) => this._call("getEvent", x);
  get list() {
    return {
      conversations: (props) => new AsyncCollection(
        ({ nextToken }) => this.listConversations({ nextToken, ...props }).then((r) => ({ ...r, items: r.conversations }))
      ),
      messages: (props) => new AsyncCollection(
        ({ nextToken }) => this.listMessages({ nextToken, ...props }).then((r) => ({ ...r, items: r.messages }))
      ),
      participants: (props) => new AsyncCollection(
        ({ nextToken }) => this.listParticipants({ nextToken, ...props }).then((r) => ({ ...r, items: r.participants }))
      )
    };
  }
  listenConversation = async ({ id, "x-user-key": userKey }) => {
    const signalListener = await SignalListener.listen({
      url: this._apiUrl,
      conversationId: id,
      userKey,
      debug: this.props.debug ?? false
    });
    return signalListener;
  };
  _call = async (operation, args) => {
    try {
      await this._testConnection();
      const response = await this._auto[operation](args);
      const res = this._checkPayloadForError(response);
      return res;
    } catch (thrown) {
      if (isApiError(thrown)) {
        throw thrown;
      }
      throw ChatClientError.map(thrown);
    }
  };
  /**
   * The Chat-API is called like any other integrations by sending requests to the bridge webhook endpoint.
   * This endpoint may return a successful status code even when the payload contains an error.
   * This method parses the payload to check for an error and throws an error if one is found.
   */
  _checkPayloadForError = (response) => {
    if (typeof response !== "object" || response === null) {
      return response;
    }
    if (!("code" in response)) {
      return response;
    }
    const { code } = response;
    if (typeof code !== "number") {
      return response;
    }
    if (code < 400 || code >= 600) {
      return response;
    }
    const message = "message" in response ? String(response["message"]) : "An error occurred";
    throw new ChatHTTPError(code, message);
  };
  static _createAxios = (props) => {
    const headers = {
      ...props.headers
    };
    const timeout = props.timeout ?? defaultTimeout;
    const withCredentials = import_browser_or_node3.isBrowser;
    const baseURL = this._getApiUrl(props);
    return import_axios3.default.create({
      baseURL,
      headers,
      withCredentials,
      timeout,
      maxBodyLength,
      maxContentLength,
      validateStatus: (status) => status >= 200 && status < 400
    });
  };
  get _apiUrl() {
    return _Client._getApiUrl(this.props);
  }
  static _getApiUrl = (props) => {
    if ("apiUrl" in props) {
      return props.apiUrl;
    }
    const baseApiUrl = props.baseApiUrl ?? defaultBaseApiUrl;
    const { webhookId } = props;
    return `${baseApiUrl}/${webhookId}`;
  };
  _testConnection = async () => {
    if (this._connectionTested) {
      return;
    }
    const url = `${this._apiUrl}/hello`;
    const axiosInstance = import_axios3.default.create({ baseURL: url });
    try {
      const response = await axiosInstance.get("/");
      this._checkPayloadForError(response.data);
    } catch (thrown) {
      throw ChatClientError.wrap(thrown, `Failed to connect to url "${this._apiUrl}"`);
    }
    this._connectionTested = true;
  };
};
var AuthenticatedClient = class _AuthenticatedClient {
  constructor(_client, user) {
    this._client = _client;
    this.user = user;
  }
  // can not be instantiated outside of this module
  static [_createAuthClient] = (client, user) => {
    return new _AuthenticatedClient(client, user);
  };
  get apiVersion() {
    return this._client.apiVersion;
  }
  createConversation = (x) => this._client.createConversation({ "x-user-key": this.user.key, ...x });
  getConversation = (x) => this._client.getConversation({ "x-user-key": this.user.key, ...x });
  getOrCreateConversation = (x) => this._client.getOrCreateConversation({ "x-user-key": this.user.key, ...x });
  deleteConversation = (x) => this._client.deleteConversation({ "x-user-key": this.user.key, ...x });
  listConversations = (x) => this._client.listConversations({ "x-user-key": this.user.key, ...x });
  listMessages = (x) => this._client.listMessages({ "x-user-key": this.user.key, ...x });
  listenConversation = (x) => this._client.listenConversation({ "x-user-key": this.user.key, ...x });
  addParticipant = (x) => this._client.addParticipant({ "x-user-key": this.user.key, ...x });
  removeParticipant = (x) => this._client.removeParticipant({ "x-user-key": this.user.key, ...x });
  getParticipant = (x) => this._client.getParticipant({ "x-user-key": this.user.key, ...x });
  listParticipants = (x) => this._client.listParticipants({ "x-user-key": this.user.key, ...x });
  createMessage = (x) => this._client.createMessage({ "x-user-key": this.user.key, ...x });
  getMessage = (x) => this._client.getMessage({ "x-user-key": this.user.key, ...x });
  deleteMessage = (x) => this._client.deleteMessage({ "x-user-key": this.user.key, ...x });
  getUser = (x) => this._client.getUser({ "x-user-key": this.user.key, ...x });
  updateUser = (x) => this._client.updateUser({ "x-user-key": this.user.key, ...x });
  deleteUser = (x) => this._client.deleteUser({ "x-user-key": this.user.key, ...x });
  createEvent = (x) => this._client.createEvent({ "x-user-key": this.user.key, ...x });
  getEvent = (x) => this._client.getEvent({ "x-user-key": this.user.key, ...x });
  get list() {
    return {
      conversations: (x) => this._client.list.conversations({ "x-user-key": this.user.key, ...x }),
      messages: (x) => this._client.list.messages({ "x-user-key": this.user.key, ...x }),
      participants: (x) => this._client.list.participants({ "x-user-key": this.user.key, ...x })
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AlreadyExistsError,
  AuthenticatedClient,
  BreakingChangesError,
  ChatClientError,
  ChatConfigError,
  ChatHTTPError,
  Client,
  ForbiddenError,
  InternalError,
  InvalidDataFormatError,
  InvalidIdentifierError,
  InvalidJsonSchemaError,
  InvalidPayloadError,
  InvalidQueryError,
  LimitExceededError,
  MethodNotFoundError,
  OperationTimeoutError,
  PayloadTooLargeError,
  PaymentRequiredError,
  QuotaExceededError,
  RateLimitedError,
  ReferenceConstraintError,
  ReferenceNotFoundError,
  RelationConflictError,
  ResourceGoneError,
  ResourceLockedConflictError,
  ResourceNotFoundError,
  RuntimeError,
  SignalListener,
  UnauthorizedError,
  UnknownError,
  UnsupportedMediaTypeError,
  axios,
  errorFrom,
  isApiError
});
//# sourceMappingURL=index.cjs.map
