import { getDoctorById } from '@/actions/appointments';
import { PageHeader } from '@/components/page-header';
import { notFound } from 'next/navigation';
import React from 'react'

export async function generateMetadata({params}){
 const { id } = await params;
 const { doctor } = await getDoctorById(id);
 if (!doctor) notFound();

 return {
    title:`Dr. ${doctor.name}-"Chikitsaak"`,
    description:`Book an apppointment with Dr.${doctor.name},${doctor.specialty}
    specialist with ${doctor.experience}years of experience.`
 };
}


const DoctorProfileLayout = async({children,params}) => {
 const { id, specialty } = await params;
 const { doctor } = await getDoctorById(id);

 if(!doctor) notFound();
  return (
    
    <div className='container mx-auto px-4 py-8'> 
      <PageHeader
      title="Doctor Profile"
      backLink={`/doctors/${encodeURIComponent(decodeURIComponent(specialty))}`}
      backLabel={decodeURIComponent(specialty)}
      />
      {children}
    </div>
  )
}

export default DoctorProfileLayout
