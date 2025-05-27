import * as React from 'react';
import { v4 as uuid } from 'uuid';
import type { ImgGenProps } from './ImgGen.types';
import { ImgGenCore } from './ImgGenCore';
import './ImgGen.css';

export { ImgGenProps };

export function ImgGen(props: ImgGenProps): React.ReactElement {
  const { _id, prompt, debug, onDocumentCreated } = props;
  const [mountKey, setMountKey] = React.useState(() => uuid());
  const [uploadedDocId, setUploadedDocId] = React.useState<string | undefined>(undefined);

  const handleDocCreated = React.useCallback(
    (docId: string) => {
      if (debug) console.log('[ImgGen] Document created:', docId);
      setUploadedDocId(docId);
      if (onDocumentCreated) {
        if (debug) console.log('[ImgGen] Calling onDocumentCreated callback');
        onDocumentCreated(docId);
      }
    },
    [debug, onDocumentCreated]
  );

  const prevIdRef = React.useRef<string | undefined>(_id);
  const prevPromptRef = React.useRef<string | undefined>(prompt);
  const prevUploadedDocIdRef = React.useRef<string | undefined>(uploadedDocId);

  React.useEffect(() => {
    const idChanged = _id !== prevIdRef.current;
    const promptChanged = prompt && prompt !== prevPromptRef.current;
    const uploadedDocIdChanged = uploadedDocId !== prevUploadedDocIdRef.current;

    if (idChanged || (!_id && promptChanged) || uploadedDocIdChanged) {
      if (debug) {
        console.log('[ImgGen] Identity change detected, generating new mountKey:', {
          idChanged,
          _id,
          prevId: prevIdRef.current,
          promptChanged: !_id && promptChanged,
          prompt,
          prevPrompt: prevPromptRef.current,
          uploadedDocIdChanged,
          uploadedDocId,
          prevUploadedDocId: prevUploadedDocIdRef.current,
        });
      }
      setMountKey(uuid());
    }

    prevIdRef.current = _id;
    prevPromptRef.current = prompt;
    prevUploadedDocIdRef.current = uploadedDocId;
  }, [_id, prompt, uploadedDocId, debug]);

  const coreProps = { ...props, onDocumentCreated: handleDocCreated } as ImgGenProps;

  if (uploadedDocId && !_id) {
    coreProps._id = uploadedDocId;
  }

  return <ImgGenCore {...coreProps} key={mountKey} />;
}

export default ImgGen;
