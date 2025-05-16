import * as React from 'react';
import '../ImgGen.css';
import { combineClasses, defaultClasses, ImgGenClasses } from '../../utils/style-utils';

// Component for when neither prompt nor _id is provided
export function ImgGenPromptWaiting({
  className,
  classes = defaultClasses,
}: {
  className?: string;
  classes?: ImgGenClasses;
}) {
  return (
    <div className={combineClasses('imggen-placeholder', className, classes.placeholder)}>
      Waiting for prompt
    </div>
  );
}
