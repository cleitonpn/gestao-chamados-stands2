import React from 'react';
import Header from '../components/Header';
import NewTicketForm from '../components/forms/NewTicketForm';

const NewTicketPage = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="px-4 py-6 md:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              Novo Chamado
            </h1>
            <p className="text-gray-600 mt-1">
              Preencha as informações abaixo para criar um novo chamado
            </p>
          </div>
          
          <NewTicketForm />
        </div>
      </main>
    </div>
  );
};

export default NewTicketPage;

