import * as core from '@actions/core'
import * as github from '@actions/github'

class File {
  added: string = ''
  modified: string = ''
  removed: string = ''
  filename: string = ''
  status: string = ''
  previous_filename: string = ''
  distinct: boolean = true
}

async function getChangedPRFiles(
  client: github.GitHub,
  prNumber: number
): Promise<File[]> {
  const options = client.pulls.listFiles.endpoint.merge({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    pull_number: prNumber
  })

  return client.paginate(options)
}

async function getChangedPushFiles(
  client: github.GitHub,
  base: string,
  head: string
): Promise<File[]> {
  return new Promise(async (resolve, reject) => {
    const options = {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      base,
      head
    }

    client.repos
      .compareCommits(options)
      .then((res: any) => resolve(res.data.files))
      .catch(reject)
  })
}

function pathForFile(f: File): string {
  switch (f.status) {
    case 'added':
      return f.added || f.filename
    case 'modified':
      return f.modified || f.filename
    case 'removed':
      return f.removed || f.filename
    default:
      return f.filename
  }
}

function directoryForPath(path: string): string | null {
  const comps = path.split('/')
  return comps.length > 1 ? comps[0] : null
}

async function run(): Promise<void> {
  try {
    const token: string = core.getInput('githubToken')
    const client = new github.GitHub(token)
    const {payload, eventName} = github.context

    let files: File[]
    switch (eventName) {
      case 'push':
        files = await getChangedPushFiles(client, payload.before, payload.after)
        break

      case 'pull_request':
        if (!payload.pull_request) {
          core.setFailed('Could not get pull request from context, exiting')
          return
        }
        files = await getChangedPRFiles(client, payload.pull_request.number)
        break

      default:
        core.setFailed('Change not initiated by a PR or Push')
        return
    }

    const paths = files.map(pathForFile)
    core.info('Files: ' + paths.join(', '))
    console.log('Files: ' + paths.join(', '))

    const services = paths
      .map(directoryForPath)
      .filter((value, index, self) => {
        return value && self.indexOf(value) === index
      })

    core.info('Services: ' + services.join(', '))
    console.log('Services: ' + services.join(', '))

    core.setOutput('services', services.join(','))
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
