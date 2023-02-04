import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { defer, EMPTY, expand, mergeMap } from 'rxjs';

export function listObjectsV2(client: S3Client, cmd: ListObjectsV2Command) {
	return defer(() => client.send(cmd)).pipe(
		expand((res) =>
			res.IsTruncated
				? client.send(
						new ListObjectsV2Command({
							...cmd.input,
							ContinuationToken: res.NextContinuationToken,
						}),
				  )
				: EMPTY,
		),
		mergeMap((res) => res.Contents ?? []),
	);
}

export function getObject(client: S3Client, cmd: GetObjectCommand) {
	return defer(() => client.send(cmd));
}

export function listAndGetObjectsV2(client: S3Client, cmd: ListObjectsV2Command) {
	return listObjectsV2(client, cmd).pipe(
		mergeMap((obj) =>
			getObject(
				client,
				new GetObjectCommand({
					Bucket: cmd.input.Bucket,
					Key: obj.Key!,
				}),
			),
		),
	);
}
