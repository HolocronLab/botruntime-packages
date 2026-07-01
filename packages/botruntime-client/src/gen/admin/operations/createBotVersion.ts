// this file was automatically generated, do not edit
/* eslint-disable */

export interface CreateBotVersionRequestHeaders {}

export interface CreateBotVersionRequestQuery {}

export interface CreateBotVersionRequestParams {
  id: string;
}

export interface CreateBotVersionRequestBody {
  name: string;
  description?: string;
}

export type CreateBotVersionInput = CreateBotVersionRequestBody & CreateBotVersionRequestHeaders & CreateBotVersionRequestQuery & CreateBotVersionRequestParams

export type CreateBotVersionRequest = {
  headers: CreateBotVersionRequestHeaders;
  query: CreateBotVersionRequestQuery;
  params: CreateBotVersionRequestParams;
  body: CreateBotVersionRequestBody;
}

export const parseReq = (input: CreateBotVersionInput): CreateBotVersionRequest & { path: string } => {
  return {
    path: `/v1/admin/bots/${encodeURIComponent(input['id'])}/versions`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: { 'name': input['name'], 'description': input['description'] },
  }
}

export interface CreateBotVersionResponse {
  version: {
    id: string;
    name: string;
    description?: string;
  };
}

