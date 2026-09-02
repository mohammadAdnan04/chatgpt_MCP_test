// app/list/[id]/page.js

'use client';

import { useParams } from 'next/navigation';
import ListDetails from '@/components/list/ListDetails'; // Adjust path as needed

export default function ListDetailsPage() {
  // Use useParams hook to get the dynamic route parameters
  const params = useParams();
  
  // console.log("🔍 Page - useParams result:", params);
  // console.log("🔍 Page - params.id:", params?.id);
  
  return <ListDetails params={params} />;
}
