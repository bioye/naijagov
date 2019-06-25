package com.naijagov.naijagov.repository;

import com.naijagov.naijagov.model.PollingUnit;

import org.springframework.data.repository.PagingAndSortingRepository;
import org.springframework.data.rest.core.annotation.RestResource;
import org.springframework.stereotype.Repository;

@Repository("pollingUnitRepository")
public interface PollingUnitRepository extends PagingAndSortingRepository<PollingUnit, Integer>{
    // Prevents POST /pollingUnit and PATCH /pollingUnit/:id
    @Override
    @RestResource(exported = false)
    public PollingUnit save(PollingUnit p);

    // Prevents DELETE /pollingUnit/:id
    @Override
    @RestResource(exported = false)
    public void delete(PollingUnit p);
}