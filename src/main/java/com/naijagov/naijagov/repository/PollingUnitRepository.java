package com.naijagov.naijagov.repository;

import com.naijagov.naijagov.model.PollingUnit;

import org.springframework.data.repository.CrudRepository;
import org.springframework.data.rest.core.annotation.RestResource;
import org.springframework.stereotype.Repository;

@Repository
public interface PollingUnitRepository extends CrudRepository<PollingUnit, Integer>{
    // Prevents POST /pollingUnit and PATCH /pollingUnit/:id
    @Override
    @RestResource(exported = false)
    public PollingUnit save(PollingUnit p);

    // Prevents DELETE /pollingUnit/:id
    @Override
    @RestResource(exported = false)
    public void delete(PollingUnit p);
}