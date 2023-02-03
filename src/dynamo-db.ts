import {
	bufferCount,
	concatMap,
	defer,
	EMPTY,
	expand,
	first,
	from,
	groupBy,
	map,
	mergeMap,
	Observable,
	toArray,
} from 'rxjs';
import {
	AttributeValue,
	BatchGetItemCommand,
	BatchWriteItemCommand,
	DeleteItemCommand,
	DeleteTableCommand,
	DescribeTableCommand,
	DynamoDBClient,
	ListTablesCommand,
	PutItemCommand,
	QueryCommand,
	ScanCommand,
	TransactGetItemsCommand,
	TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb';

type DynamoItem = Record<string, AttributeValue>;
type Table = string;

const MAX_BATCH_GET_SIZE = 100 as const;
const MAX_PUT_SIZE = 25 as const;
const MAX_TRANSACT_WRITE_SIZE = 100 as const;
const MAX_TRANSACT_GET_SIZE = 100 as const;

export function query<T extends DynamoItem>(client: DynamoDBClient, cmd: QueryCommand) {
	return defer(() => client.send(cmd)).pipe(
		expand((res) =>
			res.LastEvaluatedKey
				? defer(() =>
						client.send(
							new QueryCommand(
								Object.freeze(
									Object.assign({}, cmd.input, {
										ExclusiveStartKey: res.LastEvaluatedKey,
									}),
								),
							),
						),
				  )
				: EMPTY,
		),
		mergeMap((res) => res.Items as T[]),
	);
}

export function scan<T extends DynamoItem>(client: DynamoDBClient, cmd: ScanCommand) {
	return defer(() => client.send(cmd)).pipe(
		expand((res) =>
			res.LastEvaluatedKey
				? defer(() =>
						client.send(
							new ScanCommand(
								Object.freeze(
									Object.assign({}, cmd.input, {
										ExclusiveStartKey: res.LastEvaluatedKey,
									}),
								),
							),
						),
				  )
				: EMPTY,
		),
		mergeMap((res) => res.Items as T[]),
	);
}

export function get<T extends DynamoItem>(
	client: DynamoDBClient,
	tableName: string,
	key: Record<string, AttributeValue>,
): Observable<T | undefined> {
	return batchGet<T>(
		client,
		new BatchGetItemCommand({
			RequestItems: {
				[tableName]: {
					Keys: [key],
				},
			},
		}),
	).pipe(
		mergeMap((res) => res.get(tableName) ?? []),
		first(),
	);
}

export function batchGet<T extends DynamoItem>(
	client: DynamoDBClient,
	cmd: BatchGetItemCommand,
): Observable<Map<Table, T[]>> {
	if (cmd.input.RequestItems === undefined) return EMPTY;

	return from(Object.entries(cmd.input.RequestItems)).pipe(
		groupBy(([table]) => table),
		concatMap((group) =>
			group.pipe(
				concatMap(([table, keysAndAttributes]) =>
					from(keysAndAttributes.Keys ?? []).pipe(
						bufferCount(MAX_BATCH_GET_SIZE),
						concatMap((keysBatch) =>
							defer(() =>
								client.send(
									new BatchGetItemCommand({
										...cmd,
										RequestItems: {
											[table]: { ...keysAndAttributes, Keys: keysBatch },
										},
									}),
								),
							).pipe(
								expand((res) =>
									res.UnprocessedKeys && res.UnprocessedKeys[table] && res.UnprocessedKeys[table].Keys
										? defer(() =>
												client.send(
													new BatchGetItemCommand({
														...cmd,
														RequestItems: res.UnprocessedKeys,
													}),
												),
										  )
										: EMPTY,
								),
							),
						),
						map((res): [Table, T[]] => [table, (res.Responses?.[table] ?? []) as T[]]),
						toArray(),
						map((entries) => new Map(entries)),
					),
				),
			),
		),
	);
}

export function batchWrite(client: DynamoDBClient, cmd: BatchWriteItemCommand) {
	if (cmd.input.RequestItems === undefined) return EMPTY;

	return from(Object.entries(cmd.input.RequestItems)).pipe(
		groupBy(([table]) => table),
		mergeMap((group) =>
			group.pipe(
				mergeMap(([table, items]) =>
					from(items).pipe(
						bufferCount(MAX_PUT_SIZE),
						mergeMap((itemsBatch) =>
							defer(() =>
								client.send(
									new BatchWriteItemCommand({
										...cmd,
										RequestItems: {
											[table]: itemsBatch,
										},
									}),
								),
							).pipe(
								expand((res) =>
									res.UnprocessedItems && res.UnprocessedItems[table]
										? defer(() =>
												client.send(
													new BatchWriteItemCommand({
														...cmd,
														RequestItems: res.UnprocessedItems,
													}),
												),
										  )
										: EMPTY,
								),
							),
						),
					),
				),
			),
		),
	);
}

export function put(client: DynamoDBClient, cmd: PutItemCommand) {
	if (cmd.input.TableName === undefined || cmd.input.Item === undefined) return EMPTY;

	return batchWrite(
		client,
		new BatchWriteItemCommand({
			RequestItems: {
				[cmd.input.TableName!]: [cmd.input.Item!],
			},
		}),
	);
}

export function transactWrite(client: DynamoDBClient, cmd: TransactWriteItemsCommand) {
	if (cmd.input.TransactItems === undefined) return EMPTY;

	return from(cmd.input.TransactItems).pipe(
		bufferCount(MAX_TRANSACT_WRITE_SIZE),
		mergeMap((items) =>
			defer(() =>
				client.send(
					new TransactWriteItemsCommand({
						...cmd,
						TransactItems: items,
					}),
				),
			),
		),
	);
}

export function transactGet<T extends DynamoItem>(
	client: DynamoDBClient,
	cmd: TransactGetItemsCommand,
): Observable<T | undefined> {
	if (cmd.input.TransactItems === undefined) return EMPTY;

	return from(cmd.input.TransactItems).pipe(
		bufferCount(MAX_TRANSACT_GET_SIZE),
		concatMap((batch) =>
			defer(() =>
				client.send(
					new TransactGetItemsCommand({
						...cmd,
						TransactItems: batch,
					}),
				),
			),
		),
		mergeMap((res) => res.Responses ?? []),
		map((res) => res.Item as T | undefined),
	);
}

export function listTables(client: DynamoDBClient, cmd: ListTablesCommand): Observable<Table> {
	return defer(() => client.send(cmd)).pipe(
		expand((res) =>
			res.LastEvaluatedTableName
				? defer(() =>
						client.send(
							new ListTablesCommand({
								...cmd,
								ExclusiveStartTableName: res.LastEvaluatedTableName,
							}),
						),
				  )
				: EMPTY,
		),
		mergeMap((res) => res.TableNames ?? []),
	);
}

export function deleteItem(client: DynamoDBClient, cmd: DeleteItemCommand) {
	if (cmd.input.TableName === undefined || cmd.input.Key === undefined) return EMPTY;

	return batchWrite(
		client,
		new BatchWriteItemCommand({
			RequestItems: {
				[cmd.input.TableName]: [{ DeleteRequest: { Key: cmd.input.Key } }],
			},
		}),
	);
}

export function deleteTable(client: DynamoDBClient, cmd: DeleteTableCommand) {
	if (cmd.input.TableName === undefined) return EMPTY;

	return defer(() => client.send(cmd)).pipe(
		expand((res) =>
			res.TableDescription?.TableStatus === 'DELETING'
				? defer(() =>
						client.send(
							new DescribeTableCommand({
								TableName: cmd.input.TableName,
							}),
						),
				  )
				: EMPTY,
		),
	);
}
