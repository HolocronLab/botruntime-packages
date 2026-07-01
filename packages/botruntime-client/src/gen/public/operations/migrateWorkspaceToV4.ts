// this file was automatically generated, do not edit
/* eslint-disable */

export interface MigrateWorkspaceToV4RequestHeaders {}

export interface MigrateWorkspaceToV4RequestQuery {}

export interface MigrateWorkspaceToV4RequestParams {
  id: string;
}

export interface MigrateWorkspaceToV4RequestBody {}

export type MigrateWorkspaceToV4Input = MigrateWorkspaceToV4RequestBody & MigrateWorkspaceToV4RequestHeaders & MigrateWorkspaceToV4RequestQuery & MigrateWorkspaceToV4RequestParams

export type MigrateWorkspaceToV4Request = {
  headers: MigrateWorkspaceToV4RequestHeaders;
  query: MigrateWorkspaceToV4RequestQuery;
  params: MigrateWorkspaceToV4RequestParams;
  body: MigrateWorkspaceToV4RequestBody;
}

export const parseReq = (input: MigrateWorkspaceToV4Input): MigrateWorkspaceToV4Request & { path: string } => {
  return {
    path: `/v1/admin/workspaces/${encodeURIComponent(input['id'])}/migrate-to-v4`,
    headers: {  },
    query: {  },
    params: { 'id': input['id'] },
    body: {  },
  }
}

export interface MigrateWorkspaceToV4Response {}

