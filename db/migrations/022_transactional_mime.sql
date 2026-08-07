ALTER TABLE outbound_messages
  ADD COLUMN mime_blob_id uuid REFERENCES content_blobs(id) ON DELETE SET NULL,
  ADD COLUMN mime_byte_size bigint;

ALTER TABLE outbound_messages
  ADD CONSTRAINT outbound_messages_mime_byte_size_positive
  CHECK (mime_byte_size IS NULL OR mime_byte_size > 0);

CREATE INDEX outbound_messages_mime_blob_idx
  ON outbound_messages(mime_blob_id)
  WHERE mime_blob_id IS NOT NULL;
