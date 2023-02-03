import {
	DeleteMessageBatchCommand,
	DeleteMessageBatchRequestEntry,
	ReceiveMessageCommand,
	SendMessageBatchCommand,
	SendMessageBatchRequestEntry,
	SQSClient,
} from '@aws-sdk/client-sqs';
import { bufferCount, defer, EMPTY, expand, from, concatMap, mergeMap } from 'rxjs';

const MAX_SQS_BATCH_SIZE = 10 as const;

export function sendMessageBatch(
	client: SQSClient,
	queueUrl: string,
	messages: SendMessageBatchRequestEntry[],
	fifo = false,
) {
	from(messages).pipe(
		bufferCount(MAX_SQS_BATCH_SIZE),
		(fifo ? concatMap : mergeMap)((batch) =>
			defer(() =>
				client.send(
					new SendMessageBatchCommand({
						QueueUrl: queueUrl,
						Entries: batch,
					}),
				),
			).pipe(
				expand((res) =>
					res.Failed && res.Failed.length > 0
						? defer(() =>
								client.send(
									new SendMessageBatchCommand({
										QueueUrl: queueUrl,
										Entries: res.Failed?.map((f) => batch.find((m) => m.Id === f.Id)).filter(
											(e): e is SendMessageBatchRequestEntry => e !== undefined,
										),
									}),
								),
						  )
						: EMPTY,
				),
			),
		),
	);
}

export function receiveMessages<Message>(client: SQSClient, queueUrl: string) {
	const cmd = new ReceiveMessageCommand({
		QueueUrl: queueUrl,
		MaxNumberOfMessages: MAX_SQS_BATCH_SIZE,
		VisibilityTimeout: 5,
	});

	return defer(() => client.send(cmd)).pipe(
		expand((res) => (res.Messages && res.Messages.length > 0 ? client.send(cmd) : EMPTY)),
		mergeMap((res) => (res.Messages ?? []) as Message[]),
	);
}

export function deleteMessages(client: SQSClient, queueUrl: string, entries: DeleteMessageBatchRequestEntry[]) {
	return from(entries).pipe(
		bufferCount(MAX_SQS_BATCH_SIZE),
		mergeMap((batch) =>
			defer(() =>
				client.send(
					new DeleteMessageBatchCommand({
						QueueUrl: queueUrl,
						Entries: batch,
					}),
				),
			).pipe(
				expand((res) =>
					res.Failed && res.Failed.length > 0
						? client.send(
								new DeleteMessageBatchCommand({
									QueueUrl: queueUrl,
									Entries: res.Failed?.map((f) => batch.find((m) => m.Id === f.Id)).filter(
										(e): e is DeleteMessageBatchRequestEntry => e !== undefined,
									),
								}),
						  )
						: EMPTY,
				),
			),
		),
	);
}
