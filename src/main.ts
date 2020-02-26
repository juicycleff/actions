import * as fs from 'fs'
import * as core from '@actions/core'
import {context, GitHub} from '@actions/github'
let glob = require('glob')

// ServiceIdentifier is the file which is required in a directory in order
// for it to be classified as a service
const ServiceIdentifier = 'main.go'

// File is the object type returned by the GitHub API
class File {
  filename: string = '' // e.g. foobar/main.go
  status: string = '' // e.g. added, modified, deleted
}

// The statuses a file / service can have
const Status_Added = 'added'
const Status_Modified = 'modified'
const Status_Deleted = 'deleted'

// listServiceDirectories returns an array of all the directories which include
// the designated ServiceIdentifier file. Some services are nested within other
// directories, these will be at the start of the array.
async function listServiceDirectories(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    glob(
      `${process.env.HOME}/**/${ServiceIdentifier}`,
      {},
      (error: Error, files: string[]) => {
        if (error) {
          reject(error)
          return
        }

        // get the directories from the files
        const dirs: string[] = files.map(path => {
          const comps = path.split('/')
          return comps.slice(0, comps.length - 1).join('/')
        })

        // sort the directories by length so the subdirectories
        // will be found first if they match
        resolve(dirs.sort((a, b) => b.length - a.length))
      }
    )
  })
}

// getFilesChanged returns all the files modified in the latest push across
// all commits, leveraging the filesFromCommit function.
async function getFilesChanged(
  gh: GitHub,
  commitIDs: string[]
): Promise<File[]> {
  const repo = context.payload.repository
  const org = repo!.organization
  const owner = org || repo!.owner
  const args = {owner: owner.name, repo: repo!.name}

  return new Promise(async (resolve, reject) => {
    try {
      const responses: any[] = await Promise.all(
        commitIDs.map(async (ref: string) => {
          return gh.repos.getCommit({...args, ref})
        })
      )

      resolve(
        responses.reduce((group, res) => [...group, ...res.data.files], [])
      )
    } catch (error) {
      reject(error)
    }
  })
}

async function run(): Promise<void> {
  try {
    // Test data. When used disable the next two code blocks.
    // const commitIDs = ['foo', 'bar'];
    // const files = testFiles;

    // Initialize a github client using the token provided by the action
    const gh = new GitHub(core.getInput('token'))

    // Extract the commits from the action context
    const {commits} = context.payload
    const commitIDs = commits
      .filter((c: any) => c.distinct)
      .map((c: any) => c.id)
    const files: File[] = await getFilesChanged(gh, commitIDs)

    // Get the services which exist in source (the directory paths)
    const services = await listServiceDirectories()

    // Group the files by service directory
    const filesByService: Record<string, File[]> = files.reduce(
      (map: Record<string, File[]>, file: File): {} => {
        const srv: string | undefined = services.find(s =>
          file.filename.startsWith(s)
        )
        if (!srv) return map
        return {...map, [srv]: map[srv] ? [...map[srv], file] : [file]}
      },
      {}
    )

    // Determine the status of the service, if the designated ServiceIdentifier has
    // been modified, this is the primary way to know if a service has been created or deleted
    const statuses = Object.keys(filesByService).reduce(
      (map: Record<string, string[]>, srv: string) => {
        const mainFile = filesByService[srv].find(f =>
          f.filename.endsWith(ServiceIdentifier)
        )
        const status = mainFile ? mainFile.status : Status_Modified
        return {...map, [status]: [...map[status], srv]}
      },
      {[Status_Added]: [], [Status_Modified]: [], [Status_Deleted]: []}
    )

    // Write the files to changes.json
    fs.writeFileSync(
      `${process.env.HOME}/changes.json`,
      JSON.stringify({
        services: statuses,
        commit_ids: commitIDs
      }),
      'utf-8'
    )

    // Output to GitHub action
    core.setOutput('services_added', statuses[Status_Added].join(' '))
    core.setOutput('services_modified', statuses[Status_Modified].join(' '))
    core.setOutput('services_deleted', statuses[Status_Deleted].join(' '))
  } catch (error) {
    core.error(error.message)
  }
}

run()

const testFiles = [
  {filename: 'services/location/examples/web/demo.go', status: Status_Modified},
  {
    filename: 'services/location/examples/web/demotwo.go',
    status: Status_Modified
  },
  {filename: 'services/platform-test/main.go', status: Status_Deleted},
  {filename: 'services/location/demo.go', status: Status_Modified},
  {filename: 'services/events/main.go', status: Status_Added}
]
