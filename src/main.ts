import * as fs from 'fs'
import * as core from '@actions/core'
import {context, GitHub} from '@actions/github'
let glob = require('glob')

// ServiceIdentifier is the file which is required in a directory in order
// for it to be classified as a service
const ServiceIdentifier = 'main.go'

// The statuses a file / service can have
// interface Status String {}
// const Status_Added: Status = 'added';
// const Status_Modified: Status = 'modified'
// const Status_Deleted: Status = 'deleted'
// const Status_Unknown: Status = 'unknown'

// File is the object type returned by the GitHub API
class File {
  filename: string = '' // e.g. foobar/main.go
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'unknown' = 'unknown' // e.g. added, modified, deleted
}

// listServiceDirectories returns an array of all the directories which include
// the designated ServiceIdentifier file. Some services are nested within other
// directories, these will be at the start of the array.
async function listServiceDirectories(): Promise<string[]> {
  let query = `${process.env.HOME}/**/${ServiceIdentifier}`
  console.log(query)
  console.log(process.cwd())

  return new Promise((resolve, reject) => {
    glob(query, {}, (error: Error, files: string[]) => {
      if (error) {
        reject(error)
        return
      }

      // get the directories from the files
      let dirs: string[] = files.map(path => {
        const comps = path
          .substr(process.cwd().length + 1, path.length)
          .split('/')
        return comps.slice(0, comps.length - 1).join('/')
      })

      // sort the directories by length so the subdirectories
      // will be found first if they match
      resolve(dirs.sort((a, b) => b.length - a.length))
    })
  })
}

// getFilesChanged returns all the files modified in the latest push across
// all commits, leveraging the filesFromCommit function.
async function getFilesChanged(
  gh: GitHub,
  commitIDs: string[]
): Promise<File[]> {
  const {organization, name} = context.payload.repository!
  const args = {owner: organization, repo: name}

  return new Promise(async (resolve, reject) => {
    try {
      const responses: any[] = await Promise.all(
        commitIDs.map(async (ref: string) => {
          return gh.repos.getCommit({...args, ref})
        })
      )

      resolve(
        responses.reduce((group, res) => {
          const files = res.data.files.filter(
            (f: File) => f.status !== 'renamed'
          )
          return [...group, ...files]
        }, [])
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
    const token = core.getInput('githubToken')
    if (token === '') return core.setFailed('Missing token')
    const gh = new GitHub(token)

    // Extract the commits from the action context
    const commitIDs = context.payload.commits
      .filter((c: any) => c.distinct)
      .map((c: any) => c.id)
    const files: File[] = await getFilesChanged(gh, commitIDs)
    console.log(
      'Files: ' +
        JSON.stringify(files.map(f => ({name: f.filename, status: f.status})))
    )

    // Get the services which exist in source (the directory paths)
    let services = await listServiceDirectories()
    console.log('Services: ' + JSON.stringify(services))

    // Get the directories of any services which have been deleted (since
    // they will no longer show up in the filesystem)
    files
      .filter(f => f.filename.endsWith(ServiceIdentifier))
      .forEach(f => {
        const comps = f.filename.split('/')
        services.push(comps.slice(0, comps.length - 1).join('/'))
      })
    console.log('Services incl deleted: ' + JSON.stringify(services))

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
    let statuses: Record<string, string[]> = {
      added: [],
      modified: [],
      deleted: []
    }
    Object.keys(filesByService).forEach(srv => {
      const files = filesByService[srv]
      const mainFile = files.find(f => f.filename.endsWith(ServiceIdentifier))
      const status = mainFile ? mainFile.status : 'modified'
      console.log(srv + ' has status ' + status)
      statuses[status].push(srv)
    })
    console.log('statuses: ' + JSON.stringify(statuses))

    // Write the files to changes.json
    const data = JSON.stringify({services: statuses, commit_ids: commitIDs})
    fs.writeFileSync(`${process.env.HOME}/changes.json`, data, 'utf-8')

    // Output to GitHub action
    core.setOutput('services_added', statuses['added'].join(' '))
    core.setOutput('services_modified', statuses['modified'].join(' '))
    core.setOutput('services_deleted', statuses['deleted'].join(' '))
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()

const testFiles = [
  {filename: 'services/location/examples/web/demo.go', status: 'modified'},
  {
    filename: 'services/location/examples/web/demotwo.go',
    status: 'modified'
  },
  {filename: 'services/platform-test/main.go', status: 'deleted'},
  {filename: 'services/location/demo.go', status: 'modified'},
  {filename: 'services/events/main.go', status: 'added'}
]
