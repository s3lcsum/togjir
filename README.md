## TOGJIR
### ...a bridge between Toggl and JIRA

```
Usage: togjir.ts  [options]

Options:
  --version    Show version number                                     [boolean]
  -f, --force  Don’t ask, just save if it possible
  -h, --help   Show help                                               [boolean]

copyright 2019
```

## How to install?

Clone repo and install dependencies by cmd
```
yarn && chmod +x togjir.ts
```

## How to run?

Make sure script have __+x__ permission by using _shebang_
```
./togjir.ts
```

## How it works?

This script have personalized formulas but feel free to modify them.

There are two required rule, you have to do in toggl:
- description have to start with issue key
- entry must have at least 1m

Features I added in this scripts:
- descriptions could end with comment in bracketes, that message will be added into workLog
- in `.env` file you can specify which projects issues should be added and which should be omitted
- also in `.env` file you can specify which tags are required to add worklog
- each ticket’s duration are floored each 5 minutes (2m changes to 5m, 17m changes to 20m)
- workLogs saved by this script have toggl time entries’ id in comments, so it will be never saved two times
- time entry can’t be in progress

## Authentication

#### Toggl

Get your API token from bottom of that page: [https://www.toggl.com/app/profile] and save this as `TOGGL_TOKEN` in `.env`


#### JIRA

I use method called "Basic Authentication With API Token".
You can generate token following these steps [https://confluence.atlassian.com/cloud/api-tokens-938839638.html]
Then fill the `.evn` correctly with variables `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_TOKEN`
