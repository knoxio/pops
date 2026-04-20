import { Link, useSearchParams } from 'react-router';

import { trpc } from '@pops/api-client';
/**
 * CandidateQueuePage — tabbed view of rotation candidate queue.
 *
 * PRD-072 US-04
 */
import { Badge, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@pops/ui';

import { CandidateList } from './candidate-queue/CandidateList';
import { ExclusionList } from './candidate-queue/ExclusionList';

export function CandidateQueuePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'pending';

  const pendingCount = trpc.media.rotation.listCandidates.useQuery({ status: 'pending', limit: 1 });

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Candidate Queue"
        description="Browse and manage rotation candidates"
        backHref="/media/rotation"
        breadcrumbs={[
          { label: 'Media', href: '/media' },
          { label: 'Rotation', href: '/media/rotation' },
          { label: 'Candidate Queue' },
        ]}
        renderLink={Link}
      />

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setSearchParams({ tab: v }, { replace: true });
        }}
      >
        <TabsList>
          <TabsTrigger value="pending">
            Pending
            {pendingCount.data?.total ? (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                {pendingCount.data.total}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="added">Added</TabsTrigger>
          <TabsTrigger value="excluded">Excluded</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <CandidateList status="pending" actions="pending" />
        </TabsContent>
        <TabsContent value="added">
          <CandidateList status="added" actions="none" />
        </TabsContent>
        <TabsContent value="excluded">
          <ExclusionList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
