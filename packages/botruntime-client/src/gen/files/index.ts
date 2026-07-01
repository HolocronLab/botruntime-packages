// this file was automatically generated, do not edit
/* eslint-disable */

import axios, { AxiosInstance } from 'axios'
import { errorFrom } from './errors'
import { toAxiosRequest } from './to-axios'
import * as upsertFile from './operations/upsertFile'
import * as deleteFile from './operations/deleteFile'
import * as listFiles from './operations/listFiles'
import * as getFile from './operations/getFile'
import * as updateFileMetadata from './operations/updateFileMetadata'
import * as copyFile from './operations/copyFile'
import * as searchFiles from './operations/searchFiles'
import * as listFilePassages from './operations/listFilePassages'
import * as setFilePassages from './operations/setFilePassages'
import * as listFileTags from './operations/listFileTags'
import * as listFileTagValues from './operations/listFileTagValues'
import * as createKnowledgeBase from './operations/createKnowledgeBase'
import * as deleteKnowledgeBase from './operations/deleteKnowledgeBase'
import * as updateKnowledgeBase from './operations/updateKnowledgeBase'
import * as listKnowledgeBases from './operations/listKnowledgeBases'

export * from './models'

export * as upsertFile from './operations/upsertFile'
export * as deleteFile from './operations/deleteFile'
export * as listFiles from './operations/listFiles'
export * as getFile from './operations/getFile'
export * as updateFileMetadata from './operations/updateFileMetadata'
export * as copyFile from './operations/copyFile'
export * as searchFiles from './operations/searchFiles'
export * as listFilePassages from './operations/listFilePassages'
export * as setFilePassages from './operations/setFilePassages'
export * as listFileTags from './operations/listFileTags'
export * as listFileTagValues from './operations/listFileTagValues'
export * as createKnowledgeBase from './operations/createKnowledgeBase'
export * as deleteKnowledgeBase from './operations/deleteKnowledgeBase'
export * as updateKnowledgeBase from './operations/updateKnowledgeBase'
export * as listKnowledgeBases from './operations/listKnowledgeBases'

export const apiVersion = '1.108.0'

export type ClientProps = {
  toAxiosRequest: typeof toAxiosRequest
  toApiError: typeof toApiError
}

export class Client {

  public constructor(private axiosInstance: AxiosInstance, private props: Partial<ClientProps> = {}) {}

  public readonly upsertFile = async (input: upsertFile.UpsertFileInput): Promise<upsertFile.UpsertFileResponse> => {
    const { path, headers, query, body } = upsertFile.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<upsertFile.UpsertFileResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly deleteFile = async (input: deleteFile.DeleteFileInput): Promise<deleteFile.DeleteFileResponse> => {
    const { path, headers, query, body } = deleteFile.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<deleteFile.DeleteFileResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listFiles = async (input: listFiles.ListFilesInput): Promise<listFiles.ListFilesResponse> => {
    const { path, headers, query, body } = listFiles.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listFiles.ListFilesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly getFile = async (input: getFile.GetFileInput): Promise<getFile.GetFileResponse> => {
    const { path, headers, query, body } = getFile.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<getFile.GetFileResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly updateFileMetadata = async (input: updateFileMetadata.UpdateFileMetadataInput): Promise<updateFileMetadata.UpdateFileMetadataResponse> => {
    const { path, headers, query, body } = updateFileMetadata.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<updateFileMetadata.UpdateFileMetadataResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly copyFile = async (input: copyFile.CopyFileInput): Promise<copyFile.CopyFileResponse> => {
    const { path, headers, query, body } = copyFile.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<copyFile.CopyFileResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly searchFiles = async (input: searchFiles.SearchFilesInput): Promise<searchFiles.SearchFilesResponse> => {
    const { path, headers, query, body } = searchFiles.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<searchFiles.SearchFilesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listFilePassages = async (input: listFilePassages.ListFilePassagesInput): Promise<listFilePassages.ListFilePassagesResponse> => {
    const { path, headers, query, body } = listFilePassages.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listFilePassages.ListFilePassagesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly setFilePassages = async (input: setFilePassages.SetFilePassagesInput): Promise<setFilePassages.SetFilePassagesResponse> => {
    const { path, headers, query, body } = setFilePassages.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<setFilePassages.SetFilePassagesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listFileTags = async (input: listFileTags.ListFileTagsInput): Promise<listFileTags.ListFileTagsResponse> => {
    const { path, headers, query, body } = listFileTags.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listFileTags.ListFileTagsResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listFileTagValues = async (input: listFileTagValues.ListFileTagValuesInput): Promise<listFileTagValues.ListFileTagValuesResponse> => {
    const { path, headers, query, body } = listFileTagValues.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listFileTagValues.ListFileTagValuesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly createKnowledgeBase = async (input: createKnowledgeBase.CreateKnowledgeBaseInput): Promise<createKnowledgeBase.CreateKnowledgeBaseResponse> => {
    const { path, headers, query, body } = createKnowledgeBase.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "post",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<createKnowledgeBase.CreateKnowledgeBaseResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly deleteKnowledgeBase = async (input: deleteKnowledgeBase.DeleteKnowledgeBaseInput): Promise<deleteKnowledgeBase.DeleteKnowledgeBaseResponse> => {
    const { path, headers, query, body } = deleteKnowledgeBase.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "delete",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<deleteKnowledgeBase.DeleteKnowledgeBaseResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly updateKnowledgeBase = async (input: updateKnowledgeBase.UpdateKnowledgeBaseInput): Promise<updateKnowledgeBase.UpdateKnowledgeBaseResponse> => {
    const { path, headers, query, body } = updateKnowledgeBase.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "put",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<updateKnowledgeBase.UpdateKnowledgeBaseResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

  public readonly listKnowledgeBases = async (input: listKnowledgeBases.ListKnowledgeBasesInput): Promise<listKnowledgeBases.ListKnowledgeBasesResponse> => {
    const { path, headers, query, body } = listKnowledgeBases.parseReq(input)

    const mapRequest = this.props.toAxiosRequest ?? toAxiosRequest
    const mapErrorResponse = this.props.toApiError ?? toApiError

    const axiosReq = mapRequest({
        method: "get",
        path,
        headers: { ...headers },
        query: { ...query },
        body,
    })
    return this.axiosInstance.request<listKnowledgeBases.ListKnowledgeBasesResponse>(axiosReq)
      .then((res) => res.data)
      .catch((e) => { throw mapErrorResponse(e) })
  }

}

// maps axios error to api error type
function toApiError(err: unknown): Error {
  if (axios.isAxiosError(err) && err.response?.data) {
    return errorFrom(err.response.data)
  }
  return errorFrom(err)
}

