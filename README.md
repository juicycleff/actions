# GitHub Action: Changed Services
Assuing a mono-repo folder structure, where the top level directories are services,
this GitHub action extracts the services which were modified in the last commit. It
works for both single commits and pull requests.

The GitHub action requires one input: githubToken, this is provided by default by
GitHub actions, and can be accessed via: `${{ secrets.GITHUB_TOKEN }}`.

The single output provided is named `services`. It is an list of services which have
been changed, encoded in a string with ` ` as the seperator. It can be used as an array
in bash as demonstrated below.

## How to Use
```
name: extract-services

on:
  push:
    
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Detect which services changed
        id: services_changed
        uses: micro/actions@1.0.0
        with:
          githubToken: ${{ secrets.GITHUB_TOKEN }}
      - name: test
        run: |
          cat $HOME/services.json
          echo '${{ steps.services_changed.outputs.services }}'

          services=(${{ steps.services_changed.outputs.services }})
          for dir in "${services[@]}"; do
            echo $dir
          end
```