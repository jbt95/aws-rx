## Installation

`npm install aws-rx-dynamo-db`

## Batch write

- Automatically performs batching
- Retries unprocessed keys

```ts
import { batchWrite, batchGet } from "aws-rx-dynamo-db";
import { lastValueFrom } from "rxjs";
import {
  DynamoDBClient,
  BatchWriteItemCommand,
  BatchGetItemCommand,
} from "@aws-sdk/client-dynamodb";

await lastValueFrom(
  batchWrite(
    new DynamoDBClient({}),
    new BatchWriteItemCommand({
      RequestItems: {
        "table-name": [
          {
            PutRequest: {
              Item: { id: { S: "id" }, name: { S: "name" } },
            },
          },
        ],
      },
    })
  )
);

```

## Batch get

```ts
import { batchGet } from "aws-rx-dynamo-db";
import { lastValueFrom } from "rxjs";
import {
  DynamoDBClient,
  BatchGetItemCommand,
} from "@aws-sdk/client-dynamodb";

await lastValueFrom(
  batchGet(
    new DynamoDBClient({}),
    new BatchGetItemCommand({
      RequestItems: {
        "table-name": { Keys: [{ id: { S: "id" } }] },
      },
    })
  )
);


```
