import { CloudWatchLogsClient, GetLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { defer, EMPTY, expand, mergeMap } from 'rxjs';

export function getLogEvents(client: CloudWatchLogsClient, cmd: GetLogEventsCommand) {
	return defer(() => client.send(cmd)).pipe(
		expand((res) =>
			res.nextForwardToken
				? client.send(
						new GetLogEventsCommand({
							...cmd.input,
							nextToken: res.nextForwardToken,
						}),
				  )
				: EMPTY,
		),
		mergeMap((res) => res.events ?? []),
	);
}
