import { PublishBatchCommand, PublishBatchRequestEntry, SNSClient } from '@aws-sdk/client-sns';
import { bufferCount, concatMap, defer, EMPTY, expand, from, mergeMap } from 'rxjs';

const MAX_BATCH_SIZE = 10 as const;

export function publish(client: SNSClient, topicArn: string, entries: PublishBatchRequestEntry[], fifo = false) {
	if (entries.length === 0) return EMPTY;

	return from(entries).pipe(
		bufferCount(MAX_BATCH_SIZE),
		(fifo ? concatMap : mergeMap)((batch) =>
			defer(() => client.send(new PublishBatchCommand({ TopicArn: topicArn, PublishBatchRequestEntries: batch }))).pipe(
				expand((res) =>
					res.Failed && res.Failed.length > 0
						? client.send(
								new PublishBatchCommand({
									TopicArn: topicArn,
									PublishBatchRequestEntries: res.Failed?.map((f) => batch.find((m) => m.Id === f.Id)).filter(
										(e): e is PublishBatchRequestEntry => e !== undefined,
									),
								}),
						  )
						: EMPTY,
				),
			),
		),
	);
}
