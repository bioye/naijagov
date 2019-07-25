package com.naijagov.naijagov.repository;

import com.naijagov.naijagov.model.PollingUnit;
import com.naijagov.naijagov.model.Ward;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.repository.PagingAndSortingRepository;
import org.springframework.data.rest.core.annotation.RestResource;
import org.springframework.stereotype.Repository;

@Repository("pollingUnitRepository")
public interface PollingUnitRepository extends PagingAndSortingRepository<PollingUnit, Integer>{
    
    public Page<PollingUnit> findByWard(Pageable page, Ward ward);
    public Page<PollingUnit> findByWardId(Pageable page, Integer wardId);
  
    // Prevents POST /pollingUnit and PATCH /pollingUnit/:id
    @Override
    @RestResource(exported = false)
    public PollingUnit save(PollingUnit p);

    // Prevents DELETE /pollingUnit/:id
    @Override
    @RestResource(exported = false)
    public void delete(PollingUnit p);
}