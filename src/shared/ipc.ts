export const IPC = {
  libraryList: 'library:list',
  libraryImport: 'library:import',
  libraryGetBlocks: 'library:getBlocks',
  libraryReadPdf: 'library:readPdf',
  libraryChooseFiles: 'library:chooseFiles',
  configGet: 'config:get',
  configSave: 'config:save',
  profileList: 'profile:list',
  profileSave: 'profile:save',
  profileDelete: 'profile:delete',
  profileSetKey: 'profile:setKey',
  aiTest: 'ai:test',
  translateStart: 'translate:start',
  translateCancel: 'translate:cancel',
  translateRead: 'translate:read',
  translateSelection: 'translate:selection',
  translateProgressEvent: 'translate:progressEvent'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]