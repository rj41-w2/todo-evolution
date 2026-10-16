'use client';

import React from 'react';
import { GoalsProvider } from '../../../components/GoalsProvider';
import GoalsView from '../../../components/GoalsView';

/**
 * Standalone personal goals (issue #17). The provider is mounted here rather
 * than in the shell: nothing else reads goals, so the list does not need to be
 * global.
 */
export default function GoalsPage() {
  return (
    <GoalsProvider>
      <GoalsView />
    </GoalsProvider>
  );
}
