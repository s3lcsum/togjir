#!/usr/bin/env ts-node

import {get} from 'request'
import {config} from 'dotenv'
import * as JiraClient from 'jira-connector'
import chalk from 'chalk'
import {appendFileSync, existsSync, readFileSync} from 'fs'
import { Question, prompt, registerPrompt} from 'inquirer'
import * as moment from 'moment'
import * as yargs from 'yargs'

const echo = console.log;

const argv: any = yargs
    .usage('Usage: $0  [options]')
    .alias('f', 'force')
    .describe('f', 'Don’t ask, just save if it possible')
    .help('h')
    .alias('h', 'help')
    .epilog('copyright 2019')
    .argv;

type TimeEntry = {
    id: number,
    start: string,
    stop: string,
    duration: number,
    description: string,
    tags: string[],
}

function intro(): void {
    console.clear();

    echo(chalk.red('.___________.  ______     _______        __   __  .______       '));
    echo(chalk.red('|           | /  __  \'\   /  _____|      |  | |  | |   _  \\      '));
    echo(chalk.red('`---|  |----`|  |  |  | |  |  __        |  | |  | |  |_)  |     '));
    echo(chalk.red('    |  |     |  |  |  | |  | |_ | .--.  |  | |  | |      /      '));
    echo(chalk.red('    |  |     |  `--\'  | |  |__| | |  `--\'  | |  | |  |\\  \\----. '));
    echo(chalk.red('    |__|      \\______/   \\______|  \\______/  |__| | _| `._____| '));
    echo();
    echo(chalk.magenta('....a bridge between Toggl and JIRA'));
    echo();
    echo();
    echo('#########################################');
    echo('## author......' + chalk.cyan('s3lcsum'));
    echo('## created.....' + chalk.cyan('23-07-2019'));
    echo('#########################################');
    echo()
}

function bootstrap(): void {
    echo(chalk.yellow('Loading environment variables...'));
    config(); // Load env variables

    if (argv.force) {
        echo(chalk.grey("Used --force option"))
    } else {
        registerPrompt('datetime', require('inquirer-datepicker-prompt'))
    }
}

async function getTimeEntries(since): Promise<TimeEntry[]> {
    echo(chalk.yellow('Getting time entries...'));

    return await (new Promise((resolve, reject) => {
        // noinspection TypeScriptUnresolvedFunction
        get({
            url: `https://toggl.com/api/v8/time_entries`,
            auth: {
                user: process.env.TOGGL_TOKEN,
                pass: 'api_token'
            },
            qs: {
                start_date: since.toISOString()
            },
            json: true
        }, (error, response, body) => {
            if (error) reject(error);

            echo(chalk.yellow(`Downloaded ${body.length} time entries.`));
            resolve(body)
        })
    }))
}

function loadEntriesIds(): string[] {
    echo(chalk.yellow('Loading saved time entries’ id from file cache...'));
    let savedEntries = [];
    if(existsSync('saved_entries.csv')) {
        savedEntries = readFileSync('saved_entries.csv').toString().split("\n");
        echo(chalk.yellow(`Loaded ${savedEntries.length} previously saved IDs`))
    } else {
        echo(chalk.yellow('No saved workLogs, sorted ASC created date'))
    }

    return savedEntries
}

function createJiraClient(): JiraClient {
    echo(chalk.yellow('Connection with JIRA API server...'));
    let jira = new JiraClient({
        host: process.env.JIRA_HOST,
        strictSSL: true,
        basic_auth: {
            email: process.env.JIRA_EMAIL,
            api_token: process.env.JIRA_TOKEN
        }
    });
    echo(chalk.yellow('Connection with JIRA API successful.'));

    return jira
}

async function askStartDate(): Promise<moment.Moment> {
    const yesterday = moment().subtract(1, 'days').startOf('day');
    if (argv.force) return yesterday;

    let since: {start_date: string} = await prompt([(<Question|any>{
        name: 'start_date',
        type: 'datetime',
        message: 'Get timeEntries from toggle since: ',
        initial: yesterday.toDate(),
        date: {
            min: moment().subtract(1, 'month').format('MM DD/MM/YYYY'),
            max: moment().format('MM DD/MM/YYYY'),
        },
        format: ['dd', '/', 'mm', '/', 'yyyy']
    })]);

    return moment(since.start_date).startOf('day')
}

(async function main(): Promise<void> {
    intro();
    bootstrap();

    let jira = createJiraClient();

    let cachedEntries = loadEntriesIds();

    let startDate = await askStartDate();

    let timeEntries = await getTimeEntries(startDate);

    let total = timeEntries.length;
    for(let i = 0; i < total; null) {
        let timeEntry = timeEntries[i++];

        echo(chalk.green(`\n\n
            ## [${i}/${total}] ` + timeEntry.description));

        if (timeEntry.duration < 0) {
            echo(chalk.grey('# TimeEntry has not been stopped yet'));
            continue
        }


        // ISSUE KEY
        if (timeEntry.description == undefined) {
            echo(chalk.red('# The TimeEntry does not have description.'));
            continue
        }

        if(cachedEntries.indexOf(timeEntry.id.toString()) > -1) {
            echo(chalk.grey('# timeEntry is in cached ids'));
            continue
        }

        let key = timeEntry.description.match(/^[A-Z]+-\d+/);
        if (!key || key.length !== 1) {
            echo(chalk.red('# No issue key in description'));
            continue
        }
        let issueKey = key[0];

        if (process.env.PROJECTS.split(',').length > 0) {
            if (process.env.PROJECTS.split(',').indexOf(issueKey.split('-')[0]) < 0) {
                echo(chalk.red('# No listening project in description'));
                continue
            }
        }


        // TAGS
        let tags = [];
        if (process.env.TAGS.split(',').length > 0) {
            if (timeEntry.tags == undefined) {
                echo(chalk.red('# Empty tags list!'));
                continue
            }

            tags = timeEntry.tags.filter(x => process.env.TAGS.split(',').includes(x));
            if (!tags.length) {
                echo(chalk.red('# No listening tags'));
                continue
            }
        }



        // TIME
        if (timeEntry.duration < 60) {
            echo(chalk.red('# TimeEntry must have at least on minute'));
            continue
        }

        let timeSpent = '';
        let hours = Math.floor((Math.ceil(timeEntry.duration / 60)) / 60);
        if (hours > 0) timeSpent += hours.toString() + 'h ';
        let minutes = (Math.ceil(timeEntry.duration / 60)) % 60;
        if ((minutes % 5)) minutes += (5 - (minutes % 5));
        if (minutes > 0) timeSpent += minutes.toString() + 'm';



        // PREVENT DUPLICATES
        let currentWorkLogs: { worklogs: { comment?: string }[] } = await jira.issue.getWorkLogs({issueKey: issueKey});
        let hasBeenAlreadySaved = false;
        for (let workLog of currentWorkLogs.worklogs) {
            if (workLog.comment === undefined) {
                continue;
            }
            if((workLog.comment.slice(0, workLog.comment.indexOf(';'))) == timeEntry.id.toString()) {
                hasBeenAlreadySaved = true;
                break
            }
        }
        if (hasBeenAlreadySaved) {
            echo(chalk.red('# This timeEntry ID is already added in the ticket'));
            appendFileSync('saved_entries.csv', timeEntry.id + "\n");
            continue
        }

        let comment = timeEntry.id.toString() + ';';
        if(tags.length > 0) {
            comment += tags.join(',') + ';'
        }
        let findEntryComment = timeEntry.description.match(/\(.*\)/gm);
        if (findEntryComment && findEntryComment.length == 1) {
            comment += findEntryComment[0].slice(1, -1)
        }



        // PRINT AND CHOICE
        echo(chalk.yellow('# issueKey: ') + issueKey);
        echo(chalk.yellow('# started: ') + moment(timeEntry.start).utc().toString());
        echo(chalk.yellow('# duration: ') + timeSpent);
        echo(chalk.yellow('# comment: ') + comment);


        let answer = argv.force ? {action: '1'} // If --force, just save
            : await prompt([<Question>{
                name: 'action',
                type: 'list',
                message: 'What’s now?',
                choices: ['1) Save as workLog in JIRA', '2) Save ID but don’t workLog', '3) Go to next time entry'],
                default: 2,
            }]);

        // noinspection FallThroughInSwitchStatementJS
        switch(answer.action[0]) {
            case '1':
                echo(chalk.blue('# Adding workLog to JIRA'));
                await jira.issue.addWorkLog({
                    issueKey: issueKey,
                    notifyUsers: false,
                    timeSpent: timeSpent,
                    started: moment(timeEntry.start).utc().toISOString().slice(0, -1) + '-0600',
                    comment: comment
                });
                echo(chalk.green('# WorkLog has been saved'));
            case '2':
                echo(chalk.blue('# Saving timeEntry ID in cache'));
                appendFileSync('saved_entries.csv', timeEntry.id + "\n");
                break
        }
    }
})();
