export const IPC = {
  libraryList: 'library:list',
  libraryImport: 'library:import',
  libraryGetBlocks: 'library:getBlocks',
  libraryReadPdf: 'library:readPdf',
  libraryChooseFiles: 'library:chooseFiles'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]